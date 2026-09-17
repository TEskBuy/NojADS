import 'server-only';
/**
 * Task lifecycle (requisitos 10, 11, 12).
 *
 * Pause, resume, edit, run-now, remove. Removing a task cancels its future
 * executions and keeps every run, log and produced artefact — history is never
 * destroyed to tidy up, and other tasks keep running untouched.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { computeNextRun, specFromTask } from '@/server/tasks/schedule';
import { taskTypeDefinition } from '@/server/tasks/types';
import { enqueue, cancelJob, type QueueName } from '@/server/queue/queue';
import { idempotencyKey } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import type { Task, TaskStatus } from '@/types/models';

async function fetchTask(taskId: string, operation: string): Promise<Task> {
  const db = createAdminSupabase();
  const { data } = await db.from('tasks').select('*').eq('id', taskId).maybeSingle();
  if (!data) throw new NotFoundError({ operation, resource: 'Tarefa', id: taskId });
  return data as Task;
}

export async function activateTask(taskId: string, userId: string): Promise<Task> {
  const operation = 'ativacao de tarefa';
  const db = createAdminSupabase();
  const task = await fetchTask(taskId, operation);

  if (task.status === 'REMOVED') {
    throw new ValidationError({
      operation,
      message: 'Esta tarefa foi removida e nao pode ser reativada.',
      hint: 'Crie uma tarefa nova com a mesma configuracao.',
    });
  }

  const definition = taskTypeDefinition(task.type);
  if (!definition) {
    throw new ValidationError({
      operation, message: `Tipo de tarefa desconhecido: ${task.type}.`,
    });
  }
  if (definition.requiresSocialAccount && !task.social_account_id) {
    throw new ValidationError({
      operation,
      step: 'validacao de pre-requisitos',
      message: `A tarefa "${definition.label}" precisa de uma conta social conectada.`,
      hint: 'Conecte a conta em Redes Sociais e associe-a a esta tarefa.',
    });
  }
  if (definition.requiresAdAccount && !task.ad_account_id) {
    throw new ValidationError({
      operation,
      step: 'validacao de pre-requisitos',
      message: `A tarefa "${definition.label}" precisa de uma conta publicitaria.`,
      hint: 'Conecte a conta publicitaria e associe-a a esta tarefa.',
    });
  }

  const next = computeNextRun(specFromTask({ ...task, last_run_at: null }), new Date());
  if (!next) {
    throw new ValidationError({
      operation,
      step: 'calculo da proxima execucao',
      message: 'Esta configuracao nao produz nenhuma execucao futura.',
      hint: 'Verifique a frequencia, os horarios e a data de fim da tarefa.',
    });
  }

  const { data } = await db.from('tasks').update({
    status: 'ACTIVE',
    next_run_at: next.toISOString(),
    consecutive_failures: 0,
    last_error: null,
  }).eq('id', taskId).select().single();

  await logger.info({
    channel: 'ADMIN', action: 'task.activated',
    message: `Tarefa "${task.name}" ativada. Proxima execucao: ${next.toISOString()}.`,
    taskId, clientId: task.client_id, userId,
  });

  return data as Task;
}

export async function pauseTask(taskId: string, userId: string): Promise<Task> {
  const operation = 'pausa de tarefa';
  const db = createAdminSupabase();
  const task = await fetchTask(taskId, operation);

  const { data } = await db.from('tasks')
    .update({ status: 'PAUSED', next_run_at: null }).eq('id', taskId).select().single();

  // Cancel work already queued but not yet started.
  const { data: pending } = await db
    .from('jobs').select('id').eq('task_id', taskId).eq('status', 'PENDING');
  for (const job of (pending ?? []) as { id: string }[]) await cancelJob(job.id);

  await logger.info({
    channel: 'ADMIN', action: 'task.paused',
    message: `Tarefa "${task.name}" pausada. ${(pending ?? []).length} execucao(oes) na fila foram canceladas.`,
    taskId, clientId: task.client_id, userId,
  });

  return data as Task;
}

/**
 * Soft removal. Future executions stop; runs, logs, content and campaigns
 * produced by this task all stay exactly where they are.
 */
export async function removeTask(taskId: string, userId: string): Promise<void> {
  const operation = 'remocao de tarefa';
  const db = createAdminSupabase();
  const task = await fetchTask(taskId, operation);

  await db.from('tasks').update({
    status: 'REMOVED', next_run_at: null, removed_at: new Date().toISOString(),
  }).eq('id', taskId);

  const { data: pending } = await db
    .from('jobs').select('id').eq('task_id', taskId).eq('status', 'PENDING');
  for (const job of (pending ?? []) as { id: string }[]) await cancelJob(job.id);

  await logger.info({
    channel: 'ADMIN', action: 'task.removed',
    message:
      `Tarefa "${task.name}" removida. Historico preservado: ` +
      `${task.run_count} execucao(oes) e todo o conteudo produzido permanecem disponiveis.`,
    taskId, clientId: task.client_id, userId,
  });
}

export interface RunNowResult {
  taskRunId: string;
  jobId: string;
  deduplicated: boolean;
  nextRunAt: string | null;
}

/**
 * "Executar agora" (requisito 12).
 *
 * Validates, records a run, enqueues one job, and recomputes the next
 * scheduled execution. The idempotency key is per minute, so an impatient
 * double click produces one execution, not two.
 */
export async function runTaskNow(taskId: string, userId: string): Promise<RunNowResult> {
  const operation = 'execucao manual de tarefa';
  const db = createAdminSupabase();
  const task = await fetchTask(taskId, operation);

  if (task.status === 'REMOVED') {
    throw new ValidationError({ operation, message: 'Esta tarefa foi removida.' });
  }

  const definition = taskTypeDefinition(task.type);
  if (!definition) {
    throw new ValidationError({ operation, message: `Tipo de tarefa desconhecido: ${task.type}.` });
  }

  const minute = new Date().toISOString().slice(0, 16);
  const key = idempotencyKey('manual', taskId, minute);

  const { data: run, error } = await db.from('task_runs').insert({
    task_id: task.id,
    client_id: task.client_id,
    scheduled_for: new Date().toISOString(),
    trigger: 'MANUAL',
    status: 'QUEUED',
    triggered_by: userId,
  }).select().single();

  if (error || !run) {
    throw new AppError({
      code: 'TASK_RUN_CREATE_FAILED', operation, step: 'registo da execucao',
      message: error?.message ?? 'Nao foi possivel registar a execucao.', status: 500,
    });
  }

  const { job, deduplicated } = await enqueue({
    queue: definition.queue as QueueName,
    type: `task:${task.type}`,
    payload: { taskId: task.id, taskRunId: run.id, manual: true },
    idempotencyKey: key,
    priority: 10,   // manual runs jump the queue
    clientId: task.client_id,
    taskId: task.id,
    taskRunId: run.id,
    timeoutSeconds: definition.timeoutSeconds,
  });

  if (deduplicated) {
    await db.from('task_runs')
      .update({ status: 'SKIPPED', output: { reason: 'Ja existia uma execucao manual nesta minuto.' } })
      .eq('id', run.id);
  } else {
    await db.from('task_runs').update({ job_id: job.id }).eq('id', run.id);
  }

  // A manual run does not shift the schedule; just make sure one exists.
  let nextRunAt = task.next_run_at;
  if (task.status === 'ACTIVE' && !nextRunAt) {
    const next = computeNextRun(specFromTask(task), new Date());
    nextRunAt = next?.toISOString() ?? null;
    await db.from('tasks').update({ next_run_at: nextRunAt }).eq('id', taskId);
  }

  await logger.info({
    channel: 'ADMIN', action: 'task.run_now',
    message: `Execucao manual de "${task.name}"${deduplicated ? ' (ignorada: duplicada)' : ''}.`,
    taskId, taskRunId: run.id, clientId: task.client_id, userId, jobId: job.id,
  });

  return { taskRunId: run.id, jobId: job.id, deduplicated, nextRunAt };
}

/** Recomputes next_run_at after the schedule changes. */
export async function refreshNextRun(taskId: string): Promise<string | null> {
  const db = createAdminSupabase();
  const task = await fetchTask(taskId, 'recalculo do agendamento');
  if (task.status !== 'ACTIVE') {
    await db.from('tasks').update({ next_run_at: null }).eq('id', taskId);
    return null;
  }
  const next = computeNextRun(specFromTask({ ...task, last_run_at: null }), new Date());
  await db.from('tasks').update({ next_run_at: next?.toISOString() ?? null }).eq('id', taskId);
  return next?.toISOString() ?? null;
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  ACTIVE: 'Ativa',
  PAUSED: 'Pausada',
  DISABLED: 'Desativada',
  REMOVED: 'Removida',
  ERROR: 'Com erro',
};
