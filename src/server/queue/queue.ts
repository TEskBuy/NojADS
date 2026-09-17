import 'server-only';
/**
 * Durable queue on Postgres.
 *
 * No Redis, no external broker: jobs live in a table and workers claim them
 * with FOR UPDATE SKIP LOCKED (see claim_jobs in migration 0003). That gives
 * exactly-once claiming across any number of worker processes, survives a
 * restart, and keeps the whole system inside one dependency.
 *
 * Idempotency is enforced at insert time by a unique key, so a retried enqueue
 * — from a double click, a redelivered webhook, or the scheduler running twice
 * in the same minute — cannot create a second job.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { AppError, normalizeError } from '@/lib/errors';
import type { QueueJob } from '@/types/models';

export type QueueName = 'content' | 'publishing' | 'analytics' | 'ads' | 'billing' | 'notifications';

export interface EnqueueOptions {
  queue: QueueName;
  type: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  priority?: number;
  runAfter?: Date;
  maxAttempts?: number;
  timeoutSeconds?: number;
  clientId?: string | null;
  taskId?: string | null;
  taskRunId?: string | null;
}

export interface EnqueueResult {
  job: QueueJob;
  /** True when an identical job already existed and this call was a no-op. */
  deduplicated: boolean;
}

export async function enqueue(options: EnqueueOptions): Promise<EnqueueResult> {
  const db = createAdminSupabase();

  if (options.idempotencyKey) {
    const { data: existing } = await db
      .from('jobs').select('*').eq('idempotency_key', options.idempotencyKey).maybeSingle();
    if (existing) return { job: existing as QueueJob, deduplicated: true };
  }

  const { data, error } = await db.from('jobs').insert({
    queue: options.queue,
    type: options.type,
    payload: options.payload ?? {},
    idempotency_key: options.idempotencyKey ?? null,
    priority: options.priority ?? 100,
    run_after: (options.runAfter ?? new Date()).toISOString(),
    max_attempts: options.maxAttempts ?? 5,
    timeout_seconds: options.timeoutSeconds ?? 300,
    client_id: options.clientId ?? null,
    task_id: options.taskId ?? null,
    task_run_id: options.taskRunId ?? null,
  }).select().single();

  if (error) {
    // Lost a race on the unique key: the other insert won, and that is fine.
    if (error.code === '23505' && options.idempotencyKey) {
      const { data: existing } = await db
        .from('jobs').select('*').eq('idempotency_key', options.idempotencyKey).single();
      if (existing) return { job: existing as QueueJob, deduplicated: true };
    }
    throw new AppError({
      code: 'QUEUE_ENQUEUE_FAILED',
      operation: 'agendamento de trabalho',
      step: 'insercao na fila',
      message: error.message,
      hint: 'Verifique a ligacao a base de dados e volte a tentar.',
      status: 500,
      retryable: true,
    });
  }

  return { job: data as QueueJob, deduplicated: false };
}

/** Claims up to `limit` jobs and marks them RUNNING in a single statement. */
export async function claimJobs(worker: string, queues: QueueName[], limit = 3): Promise<QueueJob[]> {
  const db = createAdminSupabase();
  const { data, error } = await db.rpc('claim_jobs', {
    p_worker: worker,
    p_queues: queues,
    p_limit: limit,
  });
  if (error) {
    throw new AppError({
      code: 'QUEUE_CLAIM_FAILED',
      operation: 'recolha de trabalhos',
      step: 'chamada a claim_jobs',
      message: error.message,
      status: 500,
      retryable: true,
    });
  }
  return (data ?? []) as QueueJob[];
}

export async function completeJob(jobId: string, result: Record<string, unknown>): Promise<void> {
  const db = createAdminSupabase();
  await db.from('jobs').update({
    status: 'SUCCEEDED',
    result,
    finished_at: new Date().toISOString(),
    locked_by: null,
    locked_at: null,
  }).eq('id', jobId);
}

/**
 * Fails a job. Retryable failures go back to PENDING with exponential backoff
 * plus jitter; a job out of attempts becomes DEAD and stays visible in the
 * queue monitor rather than disappearing.
 */
export async function failJob(jobId: string, error: unknown, opts: { forceDead?: boolean } = {}): Promise<void> {
  const db = createAdminSupabase();
  const appError = normalizeError(error, 'execucao de trabalho');

  const { data: job } = await db
    .from('jobs').select('attempts, max_attempts').eq('id', jobId).single();
  const attempts = job?.attempts ?? 1;
  const maxAttempts = job?.max_attempts ?? 5;
  const exhausted = opts.forceDead || !appError.retryable || attempts >= maxAttempts;

  if (exhausted) {
    await db.from('jobs').update({
      status: 'DEAD',
      last_error: appError.toJSON(),
      finished_at: new Date().toISOString(),
      locked_by: null,
      locked_at: null,
    }).eq('id', jobId);
    return;
  }

  const backoffSeconds = Math.min(2 ** attempts * 15, 3600);
  const jitter = Math.floor(Math.random() * 15);
  await db.from('jobs').update({
    status: 'PENDING',
    last_error: appError.toJSON(),
    run_after: new Date(Date.now() + (backoffSeconds + jitter) * 1000).toISOString(),
    locked_by: null,
    locked_at: null,
  }).eq('id', jobId);
}

/** Puts a DEAD job back at the front of the queue. Used from the queue monitor. */
export async function retryJob(jobId: string): Promise<void> {
  const db = createAdminSupabase();
  await db.from('jobs').update({
    status: 'PENDING',
    run_after: new Date().toISOString(),
    locked_by: null,
    locked_at: null,
    attempts: 0,
  }).eq('id', jobId);
}

export async function cancelJob(jobId: string): Promise<void> {
  const db = createAdminSupabase();
  await db.from('jobs')
    .update({ status: 'CANCELLED', finished_at: new Date().toISOString() })
    .eq('id', jobId)
    .in('status', ['PENDING', 'RESERVED']);
}

/** Requeues jobs whose worker died holding the lock. */
export async function reapStalledJobs(): Promise<number> {
  const db = createAdminSupabase();
  const { data, error } = await db.rpc('reap_stalled_jobs');
  if (error) return 0;
  return Number(data ?? 0);
}

export interface QueueStats {
  queue: string;
  pending: number;
  running: number;
  dead: number;
}

export async function queueStats(): Promise<QueueStats[]> {
  const db = createAdminSupabase();
  const { data } = await db.from('jobs').select('queue, status');
  const map = new Map<string, QueueStats>();
  for (const row of (data ?? []) as { queue: string; status: string }[]) {
    const stats = map.get(row.queue) ?? { queue: row.queue, pending: 0, running: 0, dead: 0 };
    if (row.status === 'PENDING') stats.pending += 1;
    if (row.status === 'RUNNING') stats.running += 1;
    if (row.status === 'DEAD') stats.dead += 1;
    map.set(row.queue, stats);
  }
  return [...map.values()].sort((a, b) => a.queue.localeCompare(b.queue));
}
