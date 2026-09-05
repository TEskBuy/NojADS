'use server';
/**
 * Ads Manager mutations.
 *
 * Creating a campaign here writes it locally only. Nothing reaches the platform
 * until "Publicar" is pressed, and nothing spends until a person resumes it.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/server/auth/session';
import { campaignSchema, fieldErrors } from '@/server/validators/schemas';
import { capabilitiesFor, selectablePlacements } from '@/server/platform/capabilities';
import { publishCampaign, setCampaignState } from '@/server/services/campaigns';
import { checkSpendLimits } from '@/server/services/billing';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import type { ActionState } from './clients';
import type { AdCampaign } from '@/types/models';

function parseJsonField<T>(value: FormDataEntryValue | null, fallback: T): T {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export async function createCampaignAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const clientId = String(formData.get('client_id') ?? '');
    const { session } = await requireClientAccess(clientId, 'criacao de campanha', { write: true });

    const parsed = campaignSchema.safeParse({
      client_id: clientId,
      ad_account_id: formData.get('ad_account_id'),
      platform: formData.get('platform'),
      name: formData.get('name'),
      objective: formData.get('objective'),
      budget_level: formData.get('budget_level') ?? 'ADSET',
      daily_budget: formData.get('daily_budget') || null,
      lifetime_budget: formData.get('lifetime_budget') || null,
      bid_strategy: formData.get('bid_strategy') || null,
      spend_cap: formData.get('spend_cap') || null,
      special_ad_categories: parseJsonField<string[]>(formData.get('special_ad_categories'), []),
      starts_at: formData.get('starts_at') || null,
      ends_at: formData.get('ends_at') || null,
      optimization_goal: formData.get('optimization_goal'),
      billing_event: formData.get('billing_event'),
      targeting: parseJsonField(formData.get('targeting'), {
        countries: ['AO'], ageMin: 18, ageMax: 65, genders: ['ALL'],
        languages: [], interests: [], behaviors: [], customAudienceIds: [],
      }),
      placements: parseJsonField(formData.get('placements'), { mode: 'AUTOMATIC', selected: [] }),
      creative: {
        format: formData.get('creative_format') ?? 'SINGLE_IMAGE',
        primary_text: formData.get('primary_text'),
        headline: formData.get('headline') ?? '',
        description: formData.get('description') ?? '',
        call_to_action: formData.get('call_to_action') ?? 'LEARN_MORE',
        destination_url: formData.get('destination_url') ?? '',
        asset_ids: parseJsonField<string[]>(formData.get('asset_ids'), []),
        page_external_id: formData.get('page_external_id') || null,
        instagram_external_id: formData.get('instagram_external_id') || null,
      },
    });

    if (!parsed.success) {
      return { ok: false, message: 'Alguns campos precisam de correcao.', fields: fieldErrors(parsed.error) };
    }

    const input = parsed.data;
    const capabilities = capabilitiesFor(input.platform);

    // Refuse anything the platform (or this connector) does not actually do.
    if (capabilities.ads.support !== 'SUPPORTED') {
      return {
        ok: false,
        code: 'PLATFORM_ADS_UNAVAILABLE',
        message: `O conector de anuncios de ${capabilities.label} nao esta disponivel no NojAds.`,
        hint: 'Nenhuma campanha foi criada. Use o painel oficial da plataforma.',
      };
    }
    const objective = capabilities.ads.objectives.find((o) => o.value === input.objective);
    if (!objective || objective.support !== 'SUPPORTED') {
      return {
        ok: false,
        code: 'OBJECTIVE_UNAVAILABLE',
        message: `O objetivo "${input.objective}" nao esta disponivel para ${capabilities.label}.`,
        hint: 'Escolha um dos objetivos listados — sao exatamente os que a API oficial aceita.',
      };
    }
    if (input.placements.mode === 'MANUAL') {
      const allowed = new Set(selectablePlacements(input.platform).map((p) => p.value));
      const invalid = input.placements.selected.filter((p) => !allowed.has(p));
      if (invalid.length > 0) {
        return {
          ok: false,
          code: 'PLACEMENT_UNAVAILABLE',
          message: `Posicionamentos nao suportados: ${invalid.join(', ')}.`,
          hint: 'Remova-os ou volte ao modo automatico.',
        };
      }
    }

    const db = createAdminSupabase();
    const { data: adAccount } = await db
      .from('ad_accounts').select('*').eq('id', input.ad_account_id).single();
    const currency = adAccount?.currency ?? 'USD';

    // Limits are checked at creation too, not only at payment time.
    await checkSpendLimits({
      clientId,
      amount: Number(input.lifetime_budget ?? input.daily_budget ?? 0),
      currency,
      operation: 'criacao de campanha',
    });

    const { data: client } = await db.from('clients').select('is_demo').eq('id', clientId).single();
    const requiresApproval = true;

    const { data: campaign, error } = await db.from('ad_campaigns').insert({
      client_id: clientId,
      ad_account_id: input.ad_account_id,
      platform: input.platform,
      name: input.name,
      objective: input.objective,
      status: 'DRAFT',
      budget_level: input.budget_level,
      daily_budget: input.daily_budget ?? null,
      lifetime_budget: input.lifetime_budget ?? null,
      bid_strategy: input.bid_strategy ?? null,
      spend_cap: input.spend_cap ?? null,
      special_ad_categories: input.special_ad_categories,
      currency,
      starts_at: input.starts_at ? new Date(input.starts_at).toISOString() : null,
      ends_at: input.ends_at ? new Date(input.ends_at).toISOString() : null,
      origin: 'MANUAL',
      requires_approval: requiresApproval,
      created_by: session.userId,
      is_demo: client?.is_demo ?? false,
    }).select('id').single();

    if (error) {
      return { ok: false, code: 'CAMPAIGN_CREATE_FAILED', message: `Nao foi possivel criar a campanha: ${error.message}` };
    }

    const { data: adSet } = await db.from('ad_sets').insert({
      campaign_id: campaign.id,
      client_id: clientId,
      name: `${input.name} — conjunto`,
      optimization_goal: input.optimization_goal,
      billing_event: input.billing_event,
      daily_budget: input.budget_level === 'ADSET' ? input.daily_budget ?? null : null,
      lifetime_budget: input.budget_level === 'ADSET' ? input.lifetime_budget ?? null : null,
      starts_at: input.starts_at ? new Date(input.starts_at).toISOString() : null,
      ends_at: input.ends_at ? new Date(input.ends_at).toISOString() : null,
      targeting: input.targeting,
      placements: input.placements,
      is_demo: client?.is_demo ?? false,
    }).select('id').single();

    const { data: creative } = await db.from('creatives').insert({
      client_id: clientId,
      platform: input.platform,
      name: `${input.name} — criativo`,
      format: input.creative.format,
      primary_text: input.creative.primary_text,
      headline: input.creative.headline || null,
      description: input.creative.description || null,
      call_to_action: input.creative.call_to_action,
      destination_url: input.creative.destination_url || null,
      asset_ids: input.creative.asset_ids,
      page_external_id: input.creative.page_external_id ?? null,
      instagram_external_id: input.creative.instagram_external_id ?? null,
      source: 'MANUAL',
      created_by: session.userId,
      is_demo: client?.is_demo ?? false,
    }).select('id').single();

    await db.from('ads').insert({
      ad_set_id: adSet!.id,
      campaign_id: campaign.id,
      client_id: clientId,
      creative_id: creative!.id,
      name: `${input.name} — anuncio`,
      status: 'DRAFT',
      is_demo: client?.is_demo ?? false,
    });

    await logger.info({
      channel: 'ADS', action: 'campaign.drafted',
      message: `Campanha "${input.name}" criada como rascunho. Nada foi enviado a plataforma.`,
      clientId, campaignId: campaign.id, userId: session.userId,
    });

    revalidatePath('/ads');
    redirect(`/ads/${campaign.id}?criada=1`);
  } catch (err) {
    const error = normalizeError(err, 'criacao de campanha');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

async function guardCampaign(campaignId: string, operation: string) {
  const db = createAdminSupabase();
  const { data } = await db.from('ad_campaigns').select('*').eq('id', campaignId).maybeSingle();
  if (!data) throw new Error('Campanha nao encontrada.');
  const campaign = data as AdCampaign;
  const { session } = await requireClientAccess(campaign.client_id, operation, { write: true });
  return { campaign, session, db };
}

export async function approveCampaignAction(campaignId: string): Promise<ActionState> {
  try {
    const { campaign, session, db } = await guardCampaign(campaignId, 'aprovacao de campanha');

    await db.from('ad_campaigns').update({
      approved_at: new Date().toISOString(),
      approved_by: session.userId,
      requires_approval: false,
      status: campaign.status === 'PENDING_APPROVAL' ? 'DRAFT' : campaign.status,
    }).eq('id', campaignId);

    await db.from('approvals').update({
      status: 'APPROVED', decided_by: session.userId, decided_at: new Date().toISOString(),
    }).eq('subject', 'CAMPAIGN').eq('subject_id', campaignId).eq('status', 'PENDING');

    revalidatePath(`/ads/${campaignId}`);
    return { ok: true, message: 'Campanha aprovada. Pode agora publica-la na plataforma.' };
  } catch (err) {
    const error = normalizeError(err, 'aprovacao de campanha');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function publishCampaignAction(campaignId: string): Promise<ActionState> {
  try {
    const { session } = await guardCampaign(campaignId, 'publicacao de campanha');
    const result = await publishCampaign({ campaignId, userId: session.userId });

    revalidatePath(`/ads/${campaignId}`);
    revalidatePath('/ads');
    return {
      ok: true,
      message:
        `Campanha criada na plataforma (${result.campaignExternalId}) e deixada EM PAUSA. ` +
        'Nada comeca a gastar ate a ativar.',
    };
  } catch (err) {
    const error = normalizeError(err, 'publicacao de campanha');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function pauseCampaignAction(campaignId: string): Promise<ActionState> {
  try {
    const { session } = await guardCampaign(campaignId, 'pausa de campanha');
    await setCampaignState({ campaignId, action: 'PAUSE', userId: session.userId });
    revalidatePath(`/ads/${campaignId}`);
    revalidatePath('/ads');
    return { ok: true, message: 'Campanha pausada na plataforma. O gasto para.' };
  } catch (err) {
    const error = normalizeError(err, 'pausa de campanha');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function resumeCampaignAction(campaignId: string): Promise<ActionState> {
  try {
    const { campaign, session } = await guardCampaign(campaignId, 'retoma de campanha');

    await checkSpendLimits({
      clientId: campaign.client_id,
      amount: Number(campaign.lifetime_budget ?? campaign.daily_budget ?? 0),
      currency: campaign.currency,
      campaignId,
      operation: 'retoma de campanha',
    });

    await setCampaignState({ campaignId, action: 'RESUME', userId: session.userId });
    revalidatePath(`/ads/${campaignId}`);
    revalidatePath('/ads');
    return {
      ok: true,
      message: 'Campanha ativa na plataforma. A partir deste momento comeca a investir.',
    };
  } catch (err) {
    const error = normalizeError(err, 'retoma de campanha');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}
