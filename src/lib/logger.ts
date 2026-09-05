import 'server-only';
/**
 * Structured logging.
 *
 * Two destinations: stdout (always) and the activity_logs table (when a
 * channel is given). Secrets are stripped before either.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { LogChannel, LogLevel } from '@/types/models';
import { normalizeError } from '@/lib/errors';

const SECRET_KEYS = [
  'access_token', 'refresh_token', 'token', 'password', 'secret',
  'client_secret', 'app_secret', 'api_key', 'authorization', 'signature',
  'service_role_key', 'anon_key',
];

/** Recursively replaces anything that looks like a credential. */
export function redact<T>(value: T): T {
  if (Array.isArray(value)) return value.map(redact) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.some((s) => key.toLowerCase().includes(s))
        ? '[redacted]'
        : redact(val);
    }
    return out as T;
  }
  return value;
}

export interface LogEntry {
  channel: LogChannel;
  level?: LogLevel;
  action: string;
  message?: string;
  userId?: string | null;
  clientId?: string | null;
  taskId?: string | null;
  taskRunId?: string | null;
  contentId?: string | null;
  campaignId?: string | null;
  transactionId?: string | null;
  jobId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  result?: string | null;
  error?: unknown;
  metadata?: Record<string, unknown>;
}

/** Never throws: a logging failure must not take down the operation it logs. */
export async function log(entry: LogEntry): Promise<void> {
  const level = entry.level ?? 'INFO';
  const safeMetadata = redact(entry.metadata ?? {});
  const safeError = entry.error ? redact(normalizeError(entry.error).toJSON()) : null;

  const line = `[${level}] [${entry.channel}] ${entry.action}` +
    (entry.message ? ` — ${entry.message}` : '');
  if (level === 'ERROR') console.error(line, safeError ?? '');
  else if (level === 'WARN') console.warn(line);
  else console.log(line);

  try {
    const db = createAdminSupabase();
    await db.from('activity_logs').insert({
      channel: entry.channel,
      level,
      action: entry.action,
      message: entry.message ?? null,
      user_id: entry.userId ?? null,
      client_id: entry.clientId ?? null,
      task_id: entry.taskId ?? null,
      task_run_id: entry.taskRunId ?? null,
      content_id: entry.contentId ?? null,
      campaign_id: entry.campaignId ?? null,
      transaction_id: entry.transactionId ?? null,
      job_id: entry.jobId ?? null,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      result: entry.result ?? null,
      error: safeError,
      metadata: safeMetadata,
    });
  } catch (err) {
    console.error('[SYSTEM] Falha ao gravar activity_log:', (err as Error).message);
  }
}

export const logger = {
  info: (e: Omit<LogEntry, 'level'>) => log({ ...e, level: 'INFO' }),
  warn: (e: Omit<LogEntry, 'level'>) => log({ ...e, level: 'WARN' }),
  error: (e: Omit<LogEntry, 'level'>) => log({ ...e, level: 'ERROR' }),
  debug: (e: Omit<LogEntry, 'level'>) => log({ ...e, level: 'DEBUG' }),
};
