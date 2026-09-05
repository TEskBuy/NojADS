import 'server-only';
/** Shared loaders for the task screens. */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { accessibleClientIds, type Session } from '@/server/auth/session';
import type { AdAccount, Client, SocialAccount, Task, TaskRun } from '@/types/models';

export interface TaskFormData {
  clients: Client[];
  socialAccounts: SocialAccount[];
  adAccounts: AdAccount[];
}

export async function loadTaskFormData(session: Session): Promise<TaskFormData> {
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  const clientsQuery = ids === null
    ? db.from('clients').select('*').neq('status', 'ARCHIVED').order('name')
    : db.from('clients').select('*').in('id', ids.length ? ids : fallback).order('name');

  const socialQuery = ids === null
    ? db.from('social_accounts').select('*').order('display_name')
    : db.from('social_accounts').select('*').in('client_id', ids.length ? ids : fallback);

  const adQuery = ids === null
    ? db.from('ad_accounts').select('*').order('name')
    : db.from('ad_accounts').select('*').in('client_id', ids.length ? ids : fallback);

  const [clients, social, ads] = await Promise.all([clientsQuery, socialQuery, adQuery]);

  return {
    clients: (clients.data ?? []) as Client[],
    socialAccounts: (social.data ?? []) as SocialAccount[],
    adAccounts: (ads.data ?? []) as AdAccount[],
  };
}

export async function listTasks(session: Session, filters: { status?: string; client?: string }) {
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);

  let query = db.from('tasks').select('*').order('created_at', { ascending: false }).limit(200);
  if (ids !== null) {
    query = query.in('client_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  if (filters.client) query = query.eq('client_id', filters.client);
  if (filters.status) query = query.eq('status', filters.status);
  else query = query.neq('status', 'REMOVED');

  const { data } = await query;
  return (data ?? []) as Task[];
}

export async function loadTaskRuns(taskId: string, limit = 25): Promise<TaskRun[]> {
  const db = createAdminSupabase();
  const { data } = await db
    .from('task_runs').select('*').eq('task_id', taskId)
    .order('created_at', { ascending: false }).limit(limit);
  return (data ?? []) as TaskRun[];
}
