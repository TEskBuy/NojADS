import 'server-only';
/**
 * Scheduler.
 *
 * Finds ACTIVE tasks whose next_run_at has arrived, books the execution in
 * scheduled_jobs (unique on a dedupe key, so a double tick books nothing
 * twice), enqueues one job, and moves next_run_at forward.
 *
 * This runs both ways: as a long-lived loop next to the workers, and as a
 * Vercel Cron hitting /api/cron/scheduler. Because the booking is idempotent,
 * running both at once is harmless.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { enqueue, reapStalledJobs, type QueueName } from '@/server/queue/queue';
import { computeNextRun, specFromTask } from '@/server/tasks/schedule';
import { taskTypeDefinition } from '@/server/tasks/types';
import { logger } from '@/lib/logger';
import { idempotencyKey } from '@/lib/crypto';
import type { Task } from '@/types/models';

export interface SchedulerReport {
  scanned: number;
  dispatched: number;
  skipped: number;
  reaped: number;
  errors: { taskId: string; message: string }[];
}

export async function runSchedulerTick(now: Date = new Date()): Promise<SchedulerReport> {
  const db = createAdminSupabase();
  const report: SchedulerReport = { scanned: 0, dispatched: 0, skipped: 0, reaped: 0, errors: [] };

  report.reaped = await reapStalledJobs();

  const { data: due, error } = await db
    .from('tasks')
    .select('*')
    .eq('status', 'ACTIVE')
    .lte('next_run_at', now.toISOString())
    .order('next_run_at', { ascending: true })
    .limit(200);

  if (error) {
    await logger.error({
      channel: 'SYSTEM', action: 'scheduler.scan_failed', message: error.message,
    });
    return report;
  }

  const tasks = (due ?? []) as Task[];
  report.scanned = tasks.length;

  for (const task of tasks) {
    try {
      const dispatched = await dispatchTask(task, now);
      if (dispatched) report.dispatched += 1; else report.skipped += 1;
    } catch (err) {
      report.errors.push({ taskId: task.id, message: (err as Error).message });
      await logger.error({
        channel: 'SYSTEM', action: 'scheduler.dispatch_failed',
        taskId: task.id, clientId: task.client_id, error: err,
      });
    }
  }

  // Tasks that were activated without a next_run_at yet.
  await backfillMissingNextRun(now);

  return report;
}

async function dispatchTask(task: Task, now: Date): Promise<boolean> {
  const db = createAdminSupabase();
  const definition = taskTypeDefinition(task.type);

  if (!definition) {
    await db.from('tasks').update({
      status: 'ERROR',
      last_error: {
        code: 'UNKNOWN_TASK_TYPE',
        message: `Tipo de tarefa desconhecido: ${task.type}.`,
        hint: 'Edite a tarefa e escolha um tipo valido.',
      },
      next_run_at: null,
    }).eq('id', task.id);
    return false;
  }

  if (task.ends_at && new Date(task.ends_at) < now) {
    await db.from('tasks')
      .update({ status: 'DISABLED', next_run_at: null }).eq('id', task.id);
    await logger.info({
      channel: 'SYSTEM', action: 'task.ended',
      message: `Tarefa "${task.name}" chegou a data de fim e foi desativada.`,
      taskId: task.id, clientId: task.client_id,
    });
    return false;
  }

  const scheduledFor = task.next_run_at ? new Date(task.next_run_at) : now;
  const dedupe = idempotencyKey('sched', task.id, scheduledFor.toISOString());

  // The unique constraint on dedupe_key is what makes this safe to run twice.
  const { data: booking, error: bookingError } = await db
    .from('scheduled_jobs')
    .insert({
      task_id: task.id,
      client_id: task.client_id,
      scheduled_for: scheduledFor.toISOString(),
      dedupe_key: dedupe,
      origin: 'SCHEDULER',
    })
    .select()
    .single();

  if (bookingError) {
    if (bookingError.code === '23505') {
      // Already booked by another tick. Just move the clock forward.
      await advanceNextRun(task, scheduledFor);
      return false;
    }
    throw new Error(bookingError.message);
  }

  const { data: run } = await db.from('task_runs').insert({
    task_id: task.id,
    client_id: task.client_id,
    scheduled_for: scheduledFor.toISOString(),
    trigger: 'SCHEDULER',
    status: 'QUEUED',
  }).select().single();

  const { job } = await enqueue({
    queue: definition.queue as QueueName,
    type: `task:${task.type}`,
    payload: { taskId: task.id, taskRunId: run?.id, scheduledFor: scheduledFor.toISOString() },
    idempotencyKey: dedupe,
    clientId: task.client_id,
    taskId: task.id,
    taskRunId: run?.id ?? null,
    timeoutSeconds: definition.timeoutSeconds,
  });

  await db.from('scheduled_jobs')
    .update({ dispatched_at: new Date().toISOString(), job_id: job.id })
    .eq('id', booking.id);
  await db.from('task_runs').update({ job_id: job.id }).eq('id', run?.id ?? '');

  await advanceNextRun(task, scheduledFor);
  return true;
}

async function advanceNextRun(task: Task, after: Date): Promise<void> {
  const db = createAdminSupabase();
  const spec = specFromTask(task);
  // Advance from the slot just booked so the same minute is never re-booked.
  const next = computeNextRun(spec, new Date(after.getTime() + 1000));
  await db.from('tasks').update({
    next_run_at: next ? next.toISOString() : null,
    ...(next ? {} : { status: task.frequency === 'ONCE' ? 'DISABLED' : task.status }),
  }).eq('id', task.id);
}

/** Gives a next_run_at to any ACTIVE task that has none. */
async function backfillMissingNextRun(now: Date): Promise<void> {
  const db = createAdminSupabase();
  const { data } = await db
    .from('tasks').select('*').eq('status', 'ACTIVE').is('next_run_at', null).limit(100);

  for (const task of (data ?? []) as Task[]) {
    const next = computeNextRun(specFromTask(task), now);
    if (next) {
      await db.from('tasks').update({ next_run_at: next.toISOString() }).eq('id', task.id);
    } else if (task.frequency === 'ONCE') {
      await db.from('tasks').update({ status: 'DISABLED' }).eq('id', task.id);
    }
  }
}

/** Housekeeping: expired OAuth states, stale approvals, token expiry warnings. */
export async function runMaintenanceTick(): Promise<{ statesCleaned: number; approvalsExpired: number; tokensExpiring: number }> {
  const db = createAdminSupabase();

  const { count: statesCleaned } = await db
    .from('oauth_states').delete({ count: 'exact' }).lt('expires_at', new Date().toISOString());

  const { count: approvalsExpired } = await db
    .from('approvals')
    .update({ status: 'EXPIRED' }, { count: 'exact' })
    .eq('status', 'PENDING')
    .not('expires_at', 'is', null)
    .lt('expires_at', new Date().toISOString());

  // Warn once about tokens expiring inside a week.
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { data: expiring } = await db
    .from('social_tokens')
    .select('social_account_id, expires_at')
    .not('expires_at', 'is', null)
    .lt('expires_at', soon);

  for (const token of (expiring ?? []) as { social_account_id: string; expires_at: string }[]) {
    const { data: account } = await db
      .from('social_accounts')
      .select('id, client_id, platform, display_name, status')
      .eq('id', token.social_account_id).single();
    if (!account || account.status === 'EXPIRED') continue;

    await db.from('social_accounts')
      .update({ status: 'EXPIRED', status_reason: 'O token expira em breve. Reconecte a conta.' })
      .eq('id', account.id);

    await db.from('notifications').insert({
      client_id: account.client_id,
      type: 'TOKEN_EXPIRING',
      severity: 'WARNING',
      title: `Token a expirar — ${account.display_name ?? account.platform}`,
      body: `A ligacao ${account.platform} expira em ${new Date(token.expires_at).toLocaleDateString('pt-PT')}. ` +
            'Reconecte a conta para nao interromper as publicacoes.',
      link: '/redes-sociais',
    });
  }

  return {
    statesCleaned: statesCleaned ?? 0,
    approvalsExpired: approvalsExpired ?? 0,
    tokensExpiring: (expiring ?? []).length,
  };
}
