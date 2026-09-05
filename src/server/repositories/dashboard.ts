import 'server-only';
/** Everything the dashboard shows, in one round of queries. */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { accessibleClientIds, type Session } from '@/server/auth/session';
import { countScoped, scopeToClients } from './scope';
import type {
  ActivityLog, AdCampaign, Approval, Content, Task, TaskRun,
} from '@/types/models';

export interface DashboardData {
  counts: {
    clients: number;
    socialAccounts: number;
    adAccounts: number;
    activeTasks: number;
    contentTotal: number;
    campaignsActive: number;
    pendingApprovals: number;
    failedRunsToday: number;
    runsToday: number;
    publishedToday: number;
  };
  spend: { total: number; currency: string };
  upcomingTasks: (Task & { client_name?: string })[];
  upcomingContent: Content[];
  recentRuns: (TaskRun & { task_name?: string })[];
  recentActivity: ActivityLog[];
  pendingApprovals: Approval[];
  activeCampaigns: AdCampaign[];
  hasDemoData: boolean;
}

function startOfToday(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export async function loadDashboard(session: Session): Promise<DashboardData> {
  const db = createAdminSupabase();
  const clientIds = await accessibleClientIds(session);
  const scope = <T>(query: T): T => scopeToClients(query, clientIds);

  const today = startOfToday();

  const [
    clientsCount, socialCount, adCount, taskCount, contentCount, campaignCount,
    approvalCount, runsToday, failedToday, publishedToday,
  ] = await Promise.all([
    // Scoped by id, not client_id: this table IS the client.
    countScoped(() => db.from('clients')
      .select('id', { count: 'exact', head: true }).neq('status', 'ARCHIVED'), clientIds, 'id'),
    countScoped(() => db.from('social_accounts')
      .select('id', { count: 'exact', head: true }).eq('status', 'CONNECTED'), clientIds),
    countScoped(() => db.from('ad_accounts')
      .select('id', { count: 'exact', head: true }).eq('status', 'CONNECTED'), clientIds),
    countScoped(() => db.from('tasks')
      .select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'), clientIds),
    countScoped(() => db.from('content')
      .select('id', { count: 'exact', head: true }), clientIds),
    countScoped(() => db.from('ad_campaigns')
      .select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'), clientIds),
    countScoped(() => db.from('approvals')
      .select('id', { count: 'exact', head: true }).eq('status', 'PENDING'), clientIds),
    countScoped(() => db.from('task_runs')
      .select('id', { count: 'exact', head: true }).gte('created_at', today), clientIds),
    countScoped(() => db.from('task_runs')
      .select('id', { count: 'exact', head: true }).gte('created_at', today).eq('status', 'FAILED'), clientIds),
    countScoped(() => db.from('content')
      .select('id', { count: 'exact', head: true }).gte('published_at', today), clientIds),
  ]);

  const demoCount = await countScoped(
    () => db.from('clients').select('id', { count: 'exact', head: true }).eq('is_demo', true),
    clientIds, 'id',
  );

  const spendRes = await scope(
    db.from('analytics').select('spend, currency').gte('date', today.slice(0, 10)));

  const [
    upcomingTasksRes, upcomingContentRes, recentRunsRes, activityRes,
    pendingApprovalsRes, activeCampaignsRes,
  ] = await Promise.all([
    scope(db.from('tasks').select('*').eq('status', 'ACTIVE').not('next_run_at', 'is', null)
      .order('next_run_at', { ascending: true }).limit(6)),
    scope(db.from('content').select('*').in('status', ['SCHEDULED', 'PENDING_APPROVAL'])
      .not('scheduled_for', 'is', null).order('scheduled_for', { ascending: true }).limit(6)),
    scope(db.from('task_runs').select('*').order('created_at', { ascending: false }).limit(8)),
    scope(db.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(10)),
    scope(db.from('approvals').select('*').eq('status', 'PENDING')
      .order('created_at', { ascending: false }).limit(5)),
    scope(db.from('ad_campaigns').select('*').in('status', ['ACTIVE', 'PAUSED'])
      .order('created_at', { ascending: false }).limit(5)),
  ]);

  const spendRows = (spendRes.data ?? []) as { spend: number; currency: string | null }[];
  const spendTotal = spendRows.reduce((sum, row) => sum + Number(row.spend ?? 0), 0);

  const taskNames = new Map<string, string>();
  const runs = (recentRunsRes.data ?? []) as TaskRun[];
  if (runs.length > 0) {
    const { data: taskRows } = await db
      .from('tasks').select('id, name').in('id', [...new Set(runs.map((r) => r.task_id))]);
    for (const row of (taskRows ?? []) as { id: string; name: string }[]) taskNames.set(row.id, row.name);
  }

  const clientNames = new Map<string, string>();
  const upcoming = (upcomingTasksRes.data ?? []) as Task[];
  if (upcoming.length > 0) {
    const { data: clientRows } = await db
      .from('clients').select('id, name').in('id', [...new Set(upcoming.map((t) => t.client_id))]);
    for (const row of (clientRows ?? []) as { id: string; name: string }[]) clientNames.set(row.id, row.name);
  }

  return {
    counts: {
      clients: clientsCount,
      socialAccounts: socialCount,
      adAccounts: adCount,
      activeTasks: taskCount,
      contentTotal: contentCount,
      campaignsActive: campaignCount,
      pendingApprovals: approvalCount,
      runsToday,
      failedRunsToday: failedToday,
      publishedToday,
    },
    spend: { total: spendTotal, currency: spendRows[0]?.currency ?? 'USD' },
    upcomingTasks: upcoming.map((t) => ({ ...t, client_name: clientNames.get(t.client_id) })),
    upcomingContent: (upcomingContentRes.data ?? []) as Content[],
    recentRuns: runs.map((r) => ({ ...r, task_name: taskNames.get(r.task_id) })),
    recentActivity: (activityRes.data ?? []) as ActivityLog[],
    pendingApprovals: (pendingApprovalsRes.data ?? []) as Approval[],
    activeCampaigns: (activeCampaignsRes.data ?? []) as AdCampaign[],
    hasDemoData: demoCount > 0,
  };
}
