'use server';
/** Task mutations: create, edit, activate, pause, run now, remove. */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/server/auth/session';
import { fieldErrors, taskSchema } from '@/server/validators/schemas';
import { activateTask, pauseTask, refreshNextRun, removeTask, runTaskNow } from '@/server/services/tasks';
import { computeNextRun, specFromTask } from '@/server/tasks/schedule';
import { taskTypeDefinition } from '@/server/tasks/types';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import type { ActionState } from './clients';

function numbers(value: FormDataEntryValue | null): number[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value.split(',').map((v) => Number(v.trim())).filter((n) => Number.isFinite(n));
}

function strings(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

function optional(value: FormDataEntryValue | null): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

function parseForm(formData: FormData) {
  return taskSchema.safeParse({
    client_id: formData.get('client_id'),
    name: formData.get('name'),
    description: formData.get('description'),
    type: formData.get('type'),
    platform: optional(formData.get('platform')),
    social_account_id: optional(formData.get('social_account_id')),
    ad_account_id: optional(formData.get('ad_account_id')),
    quantity: formData.get('quantity') ?? 1,
    frequency: formData.get('frequency') ?? 'DAILY',
    cron_expression: optional(formData.get('cron_expression')),
    interval_minutes: optional(formData.get('interval_minutes')),
    run_at_times: strings(formData.get('run_at_times')),
    weekdays: numbers(formData.get('weekdays')),
    month_days: numbers(formData.get('month_days')),
    timezone: formData.get('timezone') || 'Africa/Luanda',
    starts_at: formData.get('starts_at') || new Date().toISOString(),
    ends_at: optional(formData.get('ends_at')),
    mode: formData.get('mode') || 'APPROVAL',
    config: (() => {
      const raw = formData.get('config');
      if (typeof raw !== 'string' || !raw.trim()) return {};
      try { return JSON.parse(raw); } catch { return {}; }
    })(),
  });
}

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const clientId = String(formData.get('client_id') ?? '');
  const { session } = await requireClientAccess(clientId, 'criacao de tarefa', { write: true });

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, message: 'Alguns campos precisam de correcao.', fields: fieldErrors(parsed.error) };
  }

  const definition = taskTypeDefinition(parsed.data.type);
  if (!definition) {
    return {
      ok: false,
      message: `Tipo de tarefa desconhecido: ${parsed.data.type}.`,
      hint: 'Escolha um dos tipos disponiveis na lista.',
    };
  }

  const db = createAdminSupabase();
  const { data: client } = await db.from('clients').select('is_demo').eq('id', clientId).single();

  const { data, error } = await db.from('tasks').insert({
    ...parsed.data,
    starts_at: new Date(parsed.data.starts_at).toISOString(),
    ends_at: parsed.data.ends_at ? new Date(parsed.data.ends_at).toISOString() : null,
    status: 'PAUSED',   // never starts working before the operator says so
    created_by: session.userId,
    is_demo: client?.is_demo ?? false,
  }).select('id').single();

  if (error) {
    return { ok: false, code: 'TASK_CREATE_FAILED', message: `Nao foi possivel criar a tarefa: ${error.message}` };
  }

  await logger.info({
    channel: 'ADMIN', action: 'task.created',
    message: `Tarefa "${parsed.data.name}" criada (pausada).`,
    taskId: data.id, clientId, userId: session.userId,
  });

  revalidatePath('/tarefas');
  redirect(`/tarefas/${data.id}?criada=1`);
}

export async function updateTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const taskId = String(formData.get('task_id') ?? '');
  const clientId = String(formData.get('client_id') ?? '');
  const { session } = await requireClientAccess(clientId, 'edicao de tarefa', { write: true });

  const parsed = parseForm(formData);
  if (!parsed.success) {
    return { ok: false, message: 'Alguns campos precisam de correcao.', fields: fieldErrors(parsed.error) };
  }

  const db = createAdminSupabase();
  const { error } = await db.from('tasks').update({
    ...parsed.data,
    starts_at: new Date(parsed.data.starts_at).toISOString(),
    ends_at: parsed.data.ends_at ? new Date(parsed.data.ends_at).toISOString() : null,
  }).eq('id', taskId);

  if (error) return { ok: false, message: `Nao foi possivel guardar: ${error.message}` };

  const nextRun = await refreshNextRun(taskId);

  await logger.info({
    channel: 'ADMIN', action: 'task.updated', taskId, clientId, userId: session.userId,
  });

  revalidatePath(`/tarefas/${taskId}`);
  revalidatePath('/tarefas');
  return {
    ok: true,
    message: nextRun
      ? `Tarefa atualizada. Proxima execucao: ${new Date(nextRun).toLocaleString('pt-PT')}.`
      : 'Tarefa atualizada. Ative-a para agendar a proxima execucao.',
  };
}

async function guarded(taskId: string, operation: string, fn: (userId: string) => Promise<ActionState>): Promise<ActionState> {
  try {
    const db = createAdminSupabase();
    const { data: task } = await db.from('tasks').select('client_id').eq('id', taskId).maybeSingle();
    if (!task) return { ok: false, message: 'Tarefa nao encontrada.' };
    const { session } = await requireClientAccess(task.client_id, operation, { write: true });
    const result = await fn(session.userId);
    revalidatePath('/tarefas');
    revalidatePath(`/tarefas/${taskId}`);
    return result;
  } catch (err) {
    const error = normalizeError(err, operation);
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function activateTaskAction(taskId: string): Promise<ActionState> {
  return guarded(taskId, 'ativacao de tarefa', async (userId) => {
    const task = await activateTask(taskId, userId);
    return {
      ok: true,
      message: `Tarefa ativa. Proxima execucao: ${new Date(task.next_run_at!).toLocaleString('pt-PT')}.`,
    };
  });
}

export async function pauseTaskAction(taskId: string): Promise<ActionState> {
  return guarded(taskId, 'pausa de tarefa', async (userId) => {
    await pauseTask(taskId, userId);
    return { ok: true, message: 'Tarefa pausada. As execucoes futuras foram canceladas; o historico fica intacto.' };
  });
}

export async function runTaskNowAction(taskId: string): Promise<ActionState> {
  return guarded(taskId, 'execucao manual de tarefa', async (userId) => {
    const result = await runTaskNow(taskId, userId);
    return {
      ok: true,
      message: result.deduplicated
        ? 'Ja existia uma execucao manual em curso neste minuto. Nada foi duplicado.'
        : 'Execucao enviada para a fila. O worker vai processa-la em segundos.',
    };
  });
}

export async function removeTaskAction(taskId: string): Promise<ActionState> {
  const result = await guarded(taskId, 'remocao de tarefa', async (userId) => {
    await removeTask(taskId, userId);
    return { ok: true, message: 'Tarefa removida. Historico, conteudos e logs preservados.' };
  });
  if (result.ok) redirect('/tarefas');
  return result;
}

/** Preview of the next executions, used live by the task form. */
export async function previewScheduleAction(input: {
  frequency: string; timezone: string; runAtTimes: string[]; weekdays: number[];
  monthDays: number[]; intervalMinutes?: number | null; cronExpression?: string | null;
  startsAt: string; endsAt?: string | null;
}): Promise<{ ok: boolean; runs: string[]; message?: string }> {
  try {
    const spec = specFromTask({
      frequency: input.frequency as never,
      timezone: input.timezone,
      run_at_times: input.runAtTimes,
      weekdays: input.weekdays,
      month_days: input.monthDays,
      interval_minutes: input.intervalMinutes ?? null,
      cron_expression: input.cronExpression ?? null,
      starts_at: input.startsAt,
      ends_at: input.endsAt ?? null,
      last_run_at: null,
    });

    const runs: string[] = [];
    let cursor = new Date();
    for (let i = 0; i < 5; i += 1) {
      const next = computeNextRun(spec, cursor);
      if (!next) break;
      runs.push(next.toISOString());
      cursor = new Date(next.getTime() + 1000);
    }

    return runs.length > 0
      ? { ok: true, runs }
      : { ok: false, runs: [], message: 'Esta configuracao nao produz nenhuma execucao futura.' };
  } catch (err) {
    return { ok: false, runs: [], message: normalizeError(err).message };
  }
}
