import 'server-only';
/**
 * Ads Worker.
 *
 * Optimisation and automatic campaigns. Both stop at the money line: the AI
 * analyses and proposes, and anything that would change real spend becomes an
 * approval request rather than an API call (requisitos 44, 65, 66).
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { aiProvider } from '@/server/providers/ai';
import { assertAIBudgetChangeAllowed } from '@/server/services/billing';
import { publishCampaign } from '@/server/services/campaigns';
import { capabilitiesFor } from '@/server/platform/capabilities';
import { logger } from '@/lib/logger';
import { ValidationError } from '@/lib/errors';
import { buildAIContext, loadTask, notify, type JobContext } from './context';
import type { AdCampaign, Platform } from '@/types/models';

export async function handleOptimizeCampaigns(ctx: JobContext): Promise<Record<string, unknown>> {
  const db = createAdminSupabase();
  const task = await loadTask(ctx.taskId!);

  const { data: campaignRows } = await db
    .from('ad_campaigns').select('*')
    .eq('client_id', task.client_id)
    .in('status', ['ACTIVE', 'PAUSED'])
    .not('external_id', 'is', null);

  const campaigns = (campaignRows ?? []) as AdCampaign[];
  if (campaigns.length === 0) {
    return { analysed: 0, message: 'Nenhuma campanha publicada para analisar.' };
  }

  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const { data: metrics } = await db
    .from('analytics').select('*')
    .eq('client_id', task.client_id).eq('scope', 'CAMPAIGN').gte('date', since);

  const rows = (metrics ?? []) as Record<string, string | number | null>[];
  const summary = campaigns.map((campaign) => {
    const own = rows.filter((r) => r.entity_id === campaign.id);
    type Totals = { impressions: number; clicks: number; spend: number; conversions: number };
    const totals = own.reduce<Totals>(
      (acc, r) => ({
        impressions: acc.impressions + Number(r.impressions ?? 0),
        clicks: acc.clicks + Number(r.clicks ?? 0),
        spend: acc.spend + Number(r.spend ?? 0),
        conversions: acc.conversions + Number(r.conversions ?? 0),
      }),
      { impressions: 0, clicks: 0, spend: 0, conversions: 0 },
    );

    const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks ? totals.spend / totals.clicks : 0;
    const cpr = totals.conversions ? totals.spend / totals.conversions : 0;

    return {
      campaignId: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      dailyBudget: campaign.daily_budget,
      currency: campaign.currency,
      ...totals,
      ctr: Number(ctr.toFixed(3)),
      cpc: Number(cpc.toFixed(4)),
      costPerResult: Number(cpr.toFixed(4)),
    };
  });

  const ai = aiProvider();
  if (!ai.isConfigured()) {
    // No model: store the arithmetic anyway. Numbers beat nothing.
    await db.from('reports').insert({
      client_id: task.client_id,
      kind: 'CAMPAIGN',
      title: `Analise de campanhas — ${new Date().toLocaleDateString('pt-PT')}`,
      period_start: since,
      period_end: new Date().toISOString().slice(0, 10),
      summary: 'Analise numerica sem IA (nenhum provider de IA configurado).',
      data: { campaigns: summary },
      generated_by: 'SYSTEM',
    });
    return { analysed: summary.length, aiUsed: false, campaigns: summary };
  }

  const aiContext = await buildAIContext({
    clientId: task.client_id,
    platform: (task.platform ?? 'FACEBOOK') as Platform,
    format: 'POST',
  });
  const analysis = await ai.analyzePerformance(aiContext, JSON.stringify(summary, null, 2));

  const { data: report } = await db.from('reports').insert({
    client_id: task.client_id,
    kind: 'CAMPAIGN',
    title: `Analise e otimizacao — ${new Date().toLocaleDateString('pt-PT')}`,
    period_start: since,
    period_end: new Date().toISOString().slice(0, 10),
    summary: analysis.data.findings.slice(0, 3).join(' '),
    data: { campaigns: summary, findings: analysis.data.findings },
    recommendations: analysis.data.recommendations,
    generated_by: 'AI',
  }).select('id').single();

  // Anything touching budget becomes a proposal, never an action.
  const proposals: { campaignId: string; action: string; blocked: string }[] = [];
  for (const recommendation of analysis.data.recommendations) {
    if (!/orcament|budget|investiment/i.test(recommendation.action)) continue;
    const campaign = campaigns[0];
    const current = Number(campaign.daily_budget ?? 0);
    if (current <= 0) continue;

    const verdict = await assertAIBudgetChangeAllowed({
      clientId: task.client_id,
      currentBudget: current,
      proposedBudget: current * 1.2,
    });

    await db.from('approvals').insert({
      client_id: task.client_id,
      subject: 'BUDGET',
      subject_id: campaign.id,
      summary: `Proposta da IA: ${recommendation.action}`,
      details: {
        rationale: recommendation.rationale,
        impact: recommendation.impact,
        currentBudget: current,
        blockedReason: verdict.reason,
      },
      amount: current,
      currency: campaign.currency,
    });
    proposals.push({ campaignId: campaign.id, action: recommendation.action, blocked: verdict.reason });
  }

  await notify({
    clientId: task.client_id,
    type: 'OPTIMIZATION_READY',
    severity: proposals.length ? 'WARNING' : 'INFO',
    title: `Analise de campanhas concluida`,
    body: proposals.length
      ? `${analysis.data.recommendations.length} recomendacoes. ${proposals.length} exigem a sua aprovacao porque mexem em orcamento.`
      : `${analysis.data.recommendations.length} recomendacoes disponiveis.`,
    link: '/relatorios',
    data: { reportId: report?.id },
  });

  await logger.info({
    channel: 'ADS', action: 'campaigns.analysed',
    clientId: task.client_id, taskId: task.id, taskRunId: ctx.taskRunId,
    metadata: { campaigns: summary.length, recommendations: analysis.data.recommendations.length },
  });

  return {
    analysed: summary.length,
    aiUsed: true,
    reportId: report?.id,
    recommendations: analysis.data.recommendations.length,
    budgetProposals: proposals.length,
  };
}

/**
 * Automatic campaign: builds the whole structure locally and stops at the
 * approval gate unless the client has explicitly enabled full automation.
 */
export async function handleAutoCampaign(ctx: JobContext): Promise<Record<string, unknown>> {
  const db = createAdminSupabase();
  const task = await loadTask(ctx.taskId!);
  const config = task.config as Record<string, unknown>;
  const platform = (task.platform ?? 'FACEBOOK') as Platform;

  const capabilities = capabilitiesFor(platform);
  if (capabilities.ads.support !== 'SUPPORTED') {
    throw new ValidationError({
      operation: 'criacao de campanha automatica',
      step: 'verificacao de suporte da plataforma',
      message: `O conector de anuncios de ${capabilities.label} nao esta disponivel no NojAds.`,
      hint: 'Escolha uma plataforma com Ads implementado ou desative esta tarefa.',
    });
  }
  if (!task.ad_account_id) {
    throw new ValidationError({
      operation: 'criacao de campanha automatica',
      message: 'A tarefa nao tem conta publicitaria associada.',
      hint: 'Edite a tarefa e escolha a conta publicitaria do cliente.',
    });
  }

  const objective = String(config.objective ?? 'OUTCOME_TRAFFIC');
  const dailyBudget = Number(config.dailyBudget ?? 0);
  if (dailyBudget <= 0) {
    throw new ValidationError({
      operation: 'criacao de campanha automatica',
      message: 'A tarefa nao define um orcamento diario.',
      hint: 'Edite a tarefa e defina o orcamento antes de a ativar.',
    });
  }

  const { data: adAccount } = await db
    .from('ad_accounts').select('*').eq('id', task.ad_account_id).single();

  const ai = aiProvider();
  const aiContext = await buildAIContext({
    clientId: task.client_id, platform, format: 'POST', objective,
  });
  const copy = ai.isConfigured()
    ? (await ai.generateAdCopy(aiContext, 1)).data[0]
    : null;

  const name = `Auto — ${new Date().toLocaleDateString('pt-PT')} — ${objective}`;
  const { data: campaign } = await db.from('ad_campaigns').insert({
    client_id: task.client_id,
    ad_account_id: task.ad_account_id,
    platform,
    task_id: task.id,
    name,
    objective,
    status: 'PENDING_APPROVAL',
    daily_budget: dailyBudget,
    budget_level: 'ADSET',
    currency: adAccount?.currency ?? 'USD',
    origin: 'AUTOMATIC',
    requires_approval: true,
    starts_at: new Date().toISOString(),
    is_demo: task.is_demo,
  }).select().single();

  const { data: adSet } = await db.from('ad_sets').insert({
    campaign_id: campaign.id,
    client_id: task.client_id,
    name: `${name} — conjunto`,
    optimization_goal: String(config.optimizationGoal ?? 'LINK_CLICKS'),
    billing_event: String(config.billingEvent ?? 'IMPRESSIONS'),
    daily_budget: dailyBudget,
    targeting: (config.targeting as Record<string, unknown>) ?? { countries: ['AO'], ageMin: 18, ageMax: 65 },
    placements: (config.placements as Record<string, unknown>) ?? { mode: 'AUTOMATIC' },
    is_demo: task.is_demo,
  }).select().single();

  const { data: creative } = await db.from('creatives').insert({
    client_id: task.client_id,
    platform,
    name: `${name} — criativo`,
    format: 'SINGLE_IMAGE',
    primary_text: copy?.primaryText ?? String(config.primaryText ?? ''),
    headline: copy?.headline ?? String(config.headline ?? ''),
    description: copy?.description ?? String(config.description ?? ''),
    call_to_action: copy?.callToAction ?? String(config.callToAction ?? 'LEARN_MORE'),
    destination_url: String(config.destinationUrl ?? ''),
    asset_ids: (config.assetIds as string[]) ?? [],
    source: copy ? 'AI' : 'MANUAL',
    is_demo: task.is_demo,
  }).select().single();

  await db.from('ads').insert({
    ad_set_id: adSet.id,
    campaign_id: campaign.id,
    client_id: task.client_id,
    creative_id: creative.id,
    name: `${name} — anuncio`,
    status: 'DRAFT',
    is_demo: task.is_demo,
  });

  const fullyAutomatic = task.mode === 'AUTOMATIC' && config.autoPublish === true;

  if (fullyAutomatic) {
    const limits = await db
      .from('spend_limits').select('block_automatic_payments').eq('client_id', task.client_id).maybeSingle();
    if (limits.data?.block_automatic_payments !== false) {
      await notify({
        clientId: task.client_id,
        type: 'CAMPAIGN_PENDING_APPROVAL',
        severity: 'WARNING',
        title: `Campanha automatica preparada: ${name}`,
        body: 'A publicacao automatica esta bloqueada nos limites de gasto deste cliente. ' +
              'A campanha aguarda a sua aprovacao.',
        link: `/ads/${campaign.id}`,
      });
      return { campaignId: campaign.id, published: false, reason: 'automatic_payments_blocked' };
    }

    await db.from('ad_campaigns')
      .update({ approved_at: new Date().toISOString(), requires_approval: false })
      .eq('id', campaign.id);
    const result = await publishCampaign({ campaignId: campaign.id, userId: task.created_by ?? '' });
    return { campaignId: campaign.id, published: true, external: result };
  }

  await db.from('approvals').insert({
    client_id: task.client_id,
    subject: 'CAMPAIGN',
    subject_id: campaign.id,
    summary: `Campanha automatica "${name}" — ${dailyBudget} ${campaign.currency}/dia`,
    details: { objective, dailyBudget, platform },
    amount: dailyBudget,
    currency: campaign.currency,
  });

  await notify({
    clientId: task.client_id,
    type: 'CAMPAIGN_PENDING_APPROVAL',
    severity: 'WARNING',
    title: `Campanha automatica a aguardar aprovacao`,
    body: `${name} — ${dailyBudget} ${campaign.currency}/dia. Nada foi enviado a plataforma nem cobrado.`,
    link: `/ads/${campaign.id}`,
  });

  return { campaignId: campaign.id, published: false, reason: 'awaiting_approval' };
}

/** Publishes a campaign from the queue. Used by the "Publicar" button. */
export async function handlePublishCampaign(ctx: JobContext): Promise<Record<string, unknown>> {
  const campaignId = ctx.payload.campaignId as string;
  const userId = ctx.payload.userId as string;
  if (!campaignId) {
    throw new ValidationError({ operation: 'publicacao de campanha', message: 'Job sem campaignId.' });
  }
  const result = await publishCampaign({ campaignId, userId });
  return result as unknown as Record<string, unknown>;
}
