import 'server-only';
/**
 * Worker runtime.
 *
 * Claims jobs, runs the matching handler under a timeout, and records the
 * outcome on both the job and its task run. A handler that throws a retryable
 * error goes back on the queue with backoff; anything else goes DEAD and stays
 * visible in the queue monitor.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { claimJobs, completeJob, failJob, type QueueName } from '@/server/queue/queue';
import { handlerFor } from './registry';
import { logger } from '@/lib/logger';
import { AppError, normalizeError } from '@/lib/errors';
import type { QueueJob } from '@/types/models';

async function withTimeout<T>(promise: Promise<T>, ms: number, jobType: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AppError({
      code: 'JOB_TIMEOUT',
      operation: `execucao de ${jobType}`,
      step: 'limite de tempo',
      message: `O trabalho excedeu ${ms / 1000} segundos e foi interrompido.`,
      hint: 'Reduza a quantidade da tarefa ou aumente o timeout do tipo de tarefa.',
      status: 504,
      retryable: true,
    })), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function runJob(job: QueueJob): Promise<void> {
  const db = createAdminSupabase();
  const started = Date.now();
  const handler = handlerFor(job.type);

  if (job.task_run_id) {
    await db.from('task_runs').update({
      status: 'RUNNING', started_at: new Date().toISOString(), attempt: job.attempts,
    }).eq('id', job.task_run_id);
  }

  if (!handler) {
    const error = new AppError({
      code: 'UNKNOWN_JOB_TYPE',
      operation: 'execucao de trabalho',
      step: 'resolucao do handler',
      message: `Nenhum handler registado para o tipo "${job.type}".`,
      hint: 'Verifique src/server/workers/registry.ts.',
      status: 500,
    });
    await failJob(job.id, error, { forceDead: true });
    await finishRun(job, 'FAILED', started, {}, error);
    return;
  }

  try {
    const result = await withTimeout(
      handler({
        jobId: job.id,
        taskId: job.task_id ?? undefined,
        taskRunId: job.task_run_id ?? undefined,
        clientId: job.client_id ?? undefined,
        payload: job.payload,
      }),
      job.timeout_seconds * 1000,
      job.type,
    );

    await completeJob(job.id, result);
    await finishRun(job, 'SUCCEEDED', started, result);
    await bumpTask(job, true);
  } catch (err) {
    const appError = normalizeError(err, `execucao de ${job.type}`);
    await failJob(job.id, appError);

    // The run is only FAILED when no attempts remain.
    const exhausted = !appError.retryable || job.attempts >= job.max_attempts;
    if (exhausted) {
      await finishRun(job, 'FAILED', started, {}, appError);
      await bumpTask(job, false, appError);
    }

    await logger.error({
      channel: 'SYSTEM', action: 'job.failed',
      message: appError.toDisplay(),
      jobId: job.id, taskId: job.task_id, taskRunId: job.task_run_id,
      clientId: job.client_id, error: appError,
      metadata: { type: job.type, attempt: job.attempts, willRetry: !exhausted },
    });
  }
}

async function finishRun(
  job: QueueJob, status: 'SUCCEEDED' | 'FAILED', started: number,
  output: Record<string, unknown>, error?: AppError,
): Promise<void> {
  if (!job.task_run_id) return;
  const db = createAdminSupabase();
  await db.from('task_runs').update({
    status,
    finished_at: new Date().toISOString(),
    duration_ms: Date.now() - started,
    output,
    error: error?.toJSON() ?? null,
  }).eq('id', job.task_run_id);
}

async function bumpTask(job: QueueJob, ok: boolean, error?: AppError): Promise<void> {
  if (!job.task_id) return;
  const db = createAdminSupabase();
  const { data: task } = await db
    .from('tasks').select('run_count, failure_count, consecutive_failures, name, client_id')
    .eq('id', job.task_id).maybeSingle();
  if (!task) return;

  const consecutive = ok ? 0 : (task.consecutive_failures ?? 0) + 1;

  await db.from('tasks').update({
    last_run_at: new Date().toISOString(),
    last_status: ok ? 'SUCCEEDED' : 'FAILED',
    run_count: (task.run_count ?? 0) + 1,
    failure_count: (task.failure_count ?? 0) + (ok ? 0 : 1),
    consecutive_failures: consecutive,
    last_error: ok ? null : (error?.toJSON() ?? null),
    // Five failures in a row: stop rather than keep failing quietly.
    ...(consecutive >= 5 ? { status: 'ERROR', next_run_at: null } : {}),
  }).eq('id', job.task_id);

  if (consecutive >= 5) {
    await db.from('notifications').insert({
      client_id: task.client_id,
      type: 'TASK_DISABLED_AFTER_FAILURES',
      severity: 'ERROR',
      title: `Tarefa "${task.name}" foi parada`,
      body: 'A tarefa falhou 5 vezes seguidas e foi colocada em estado de erro. ' +
            'Corrija a causa e retome-a manualmente.',
      link: `/tarefas/${job.task_id}`,
    });
  }
}

export interface WorkerLoopOptions {
  workerId: string;
  queues: QueueName[];
  concurrency: number;
  pollIntervalMs: number;
  signal?: { stopped: boolean };
}

export async function runWorkerLoop(options: WorkerLoopOptions): Promise<void> {
  const signal = options.signal ?? { stopped: false };
  console.log(
    `[NojAds] Worker ${options.workerId} iniciado. ` +
    `Filas: ${options.queues.join(', ')} | Concorrencia: ${options.concurrency}`,
  );

  while (!signal.stopped) {
    let jobs: QueueJob[] = [];
    try {
      jobs = await claimJobs(options.workerId, options.queues, options.concurrency);
    } catch (err) {
      console.error('[worker] falha ao recolher trabalhos:', (err as Error).message);
    }

    if (jobs.length === 0) {
      await new Promise((r) => setTimeout(r, options.pollIntervalMs));
      continue;
    }

    await Promise.all(jobs.map(async (job) => {
      console.log(`[worker] ${job.type} (${job.id}) tentativa ${job.attempts}`);
      try {
        await runJob(job);
      } catch (err) {
        console.error(`[worker] erro nao tratado em ${job.id}:`, (err as Error).message);
      }
    }));
  }

  console.log(`[NojAds] Worker ${options.workerId} terminado.`);
}
