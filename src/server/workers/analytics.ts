import 'server-only';
/**
 * Analytics Worker.
 *
 * Pulls account, post and campaign metrics from each platform and upserts one
 * row per (entity, day). The unique index on analytics makes re-running a sync
 * for an overlapping window correct rather than duplicated.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { socialProviderFor } from '@/server/providers/social';
import { adsProviderFor } from '@/server/providers/ads';
import { contextForAdAccount, contextForSocialAccount } from '@/server/services/tokens';
import { capabilitiesFor } from '@/server/platform/capabilities';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { loadTask, type JobContext } from './context';
import type { AdCampaign, Content, SocialAccount } from '@/types/models';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function handleSyncAnalytics(ctx: JobContext): Promise<Record<string, unknown>> {
  const db = createAdminSupabase();
  const task = ctx.taskId ? await loadTask(ctx.taskId) : null;
  const clientId = task?.client_id ?? (ctx.clientId as string);

  const lookbackDays = Number((ctx.payload.lookbackDays as number) ?? 7);
  const until = isoDate(new Date());
  const since = isoDate(new Date(Date.now() - lookbackDays * 86_400_000));

  const summary = { accounts: 0, posts: 0, campaigns: 0, errors: [] as string[] };

  const { data: accountRows } = await db
    .from('social_accounts').select('*')
    .eq('client_id', clientId).eq('status', 'CONNECTED');

  for (const account of (accountRows ?? []) as SocialAccount[]) {
    if (capabilitiesFor(account.platform).social.insights !== 'SUPPORTED') continue;

    try {
      const provider = socialProviderFor(account.platform);
      const providerCtx = await contextForSocialAccount(account.id);

      const accountInsights = await provider.getAccountInsights(providerCtx, { since, until });
      for (const row of accountInsights) {
        await upsertAnalytics(clientId, {
          platform: account.platform,
          scope: 'ACCOUNT',
          entity_id: account.id,
          external_id: row.externalId,
          date: row.date,
          impressions: row.impressions ?? 0,
          reach: row.reach ?? 0,
          followers: row.followers ?? 0,
          raw: row.raw,
          is_demo: account.is_demo,
        });
        summary.accounts += 1;
      }

      const { data: publishedRows } = await db
        .from('content').select('id, external_id')
        .eq('client_id', clientId)
        .eq('social_account_id', account.id)
        .eq('status', 'PUBLISHED')
        .not('external_id', 'is', null)
        .gte('published_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
        .limit(50);

      const published = (publishedRows ?? []) as Pick<Content, 'id' | 'external_id'>[];
      if (published.length > 0) {
        const insights = await provider.getPostInsights(
          providerCtx, published.map((p) => p.external_id!),
        );
        const byExternal = new Map(published.map((p) => [p.external_id!, p.id]));

        for (const row of insights) {
          const engagement = (row.likes ?? 0) + (row.comments ?? 0) + (row.shares ?? 0) + (row.saves ?? 0);
          await upsertAnalytics(clientId, {
            platform: account.platform,
            scope: 'CONTENT',
            entity_id: byExternal.get(row.externalId) ?? null,
            external_id: row.externalId,
            date: until,
            impressions: row.impressions ?? 0,
            reach: row.reach ?? 0,
            likes: row.likes ?? 0,
            comments: row.comments ?? 0,
            shares: row.shares ?? 0,
            saves: row.saves ?? 0,
            video_views: row.videoViews ?? 0,
            engagement_rate: row.reach ? engagement / row.reach : null,
            raw: row.raw,
            is_demo: account.is_demo,
          });
          summary.posts += 1;
        }
      }
    } catch (err) {
      const appError = normalizeError(err, 'sincronizacao de metricas');
      summary.errors.push(`${account.platform}: ${appError.message}`);
      await logger.warn({
        channel: 'SYSTEM', action: 'analytics.account_sync_failed',
        clientId, error: appError, metadata: { accountId: account.id },
      });
    }
  }

  const { data: campaignRows } = await db
    .from('ad_campaigns').select('*')
    .eq('client_id', clientId)
    .not('external_id', 'is', null)
    .in('status', ['ACTIVE', 'PAUSED', 'COMPLETED']);

  const campaigns = (campaignRows ?? []) as AdCampaign[];
  const byAdAccount = new Map<string, AdCampaign[]>();
  for (const campaign of campaigns) {
    const list = byAdAccount.get(campaign.ad_account_id) ?? [];
    list.push(campaign);
    byAdAccount.set(campaign.ad_account_id, list);
  }

  for (const [adAccountId, group] of byAdAccount) {
    try {
      const provider = adsProviderFor(group[0].platform);
      if (provider.capabilities.ads.operations.metrics !== 'SUPPORTED') continue;

      const providerCtx = await contextForAdAccount(adAccountId);
      const metrics = await provider.getCampaignMetrics(providerCtx, {
        externalIds: group.map((c) => c.external_id!),
        since,
        until,
      });
      const byExternal = new Map(group.map((c) => [c.external_id!, c]));

      for (const row of metrics) {
        const campaign = byExternal.get(row.externalId);
        await upsertAnalytics(clientId, {
          platform: campaign?.platform ?? group[0].platform,
          scope: 'CAMPAIGN',
          entity_id: campaign?.id ?? null,
          external_id: row.externalId,
          date: row.date,
          impressions: row.impressions,
          reach: row.reach,
          clicks: row.clicks,
          spend: row.spend,
          currency: row.currency,
          ctr: row.ctr ?? null,
          cpc: row.cpc ?? null,
          cpm: row.cpm ?? null,
          conversions: row.conversions ?? 0,
          cost_per_result: row.conversions ? row.spend / row.conversions : null,
          video_views: row.videoViews ?? 0,
          raw: row.raw,
          is_demo: campaign?.is_demo ?? false,
        });
        summary.campaigns += 1;
      }

      // Keep local campaign status in step with the platform (requisito 31).
      for (const campaign of group) {
        try {
          const remote = await provider.getCampaign(providerCtx, campaign.external_id!);
          await db.from('ad_campaigns').update({
            external_status: remote.status,
            last_synced_at: new Date().toISOString(),
          }).eq('id', campaign.id);
        } catch { /* metrics already stored; status refresh is best effort */ }
      }
    } catch (err) {
      const appError = normalizeError(err, 'sincronizacao de metricas de campanha');
      summary.errors.push(`Ads ${adAccountId}: ${appError.message}`);
    }
  }

  await logger.info({
    channel: 'SYSTEM', action: 'analytics.synced',
    message: `Metricas sincronizadas: ${summary.accounts} contas, ${summary.posts} publicacoes, ${summary.campaigns} campanhas.`,
    clientId, taskId: ctx.taskId, taskRunId: ctx.taskRunId, metadata: summary,
  });

  return summary as unknown as Record<string, unknown>;
}

async function upsertAnalytics(clientId: string, row: Record<string, unknown>): Promise<void> {
  const db = createAdminSupabase();
  await db.from('analytics').upsert(
    { client_id: clientId, synced_at: new Date().toISOString(), ...row },
    { onConflict: 'client_id,platform,scope,entity_id,external_id,date', ignoreDuplicates: false },
  );
}

/** Weekly/monthly report from data already stored — no extra platform calls. */
export async function handleGenerateReport(ctx: JobContext): Promise<Record<string, unknown>> {
  const db = createAdminSupabase();
  const task = ctx.taskId ? await loadTask(ctx.taskId) : null;
  const clientId = task?.client_id ?? (ctx.clientId as string);
  const kind = (task?.config as Record<string, unknown>)?.reportKind as string ?? 'WEEKLY';
  const days = kind === 'MONTHLY' ? 30 : kind === 'DAILY' ? 1 : 7;

  const periodEnd = isoDate(new Date());
  const periodStart = isoDate(new Date(Date.now() - days * 86_400_000));

  const { data: rows } = await db
    .from('analytics').select('*')
    .eq('client_id', clientId).gte('date', periodStart).lte('date', periodEnd);

  const totals = (rows ?? []).reduce((acc, row: Record<string, number>) => ({
    impressions: acc.impressions + Number(row.impressions ?? 0),
    reach: acc.reach + Number(row.reach ?? 0),
    clicks: acc.clicks + Number(row.clicks ?? 0),
    likes: acc.likes + Number(row.likes ?? 0),
    comments: acc.comments + Number(row.comments ?? 0),
    shares: acc.shares + Number(row.shares ?? 0),
    conversions: acc.conversions + Number(row.conversions ?? 0),
    spend: acc.spend + Number(row.spend ?? 0),
  }), { impressions: 0, reach: 0, clicks: 0, likes: 0, comments: 0, shares: 0, conversions: 0, spend: 0 });

  const { count: publishedCount } = await db
    .from('content').select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).eq('status', 'PUBLISHED')
    .gte('published_at', `${periodStart}T00:00:00Z`);

  const { data: report } = await db.from('reports').insert({
    client_id: clientId,
    kind,
    title: `Relatorio ${kind === 'MONTHLY' ? 'mensal' : kind === 'DAILY' ? 'diario' : 'semanal'} — ${periodStart} a ${periodEnd}`,
    period_start: periodStart,
    period_end: periodEnd,
    summary:
      `${publishedCount ?? 0} publicacoes, ${totals.impressions} impressoes, ` +
      `${totals.reach} alcance, ${totals.clicks} cliques, ${totals.spend.toFixed(2)} de investimento.`,
    data: { totals, publishedCount: publishedCount ?? 0, rowsAnalysed: (rows ?? []).length },
    generated_by: 'SYSTEM',
  }).select('id').single();

  return { reportId: report?.id, totals, periodStart, periodEnd };
}
