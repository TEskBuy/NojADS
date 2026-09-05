import 'server-only';
/**
 * Campaign publishing.
 *
 * The full chain — validate, check billing, create Campaign, Ad Set, Creative,
 * Ad — with the external ids written back after each step. If step 3 fails,
 * steps 1 and 2 stay recorded with their real ids, so a retry resumes instead
 * of creating orphans on the platform.
 *
 * ACTIVE is written only when the platform confirms. Requisito 29.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { adsProviderFor } from '@/server/providers/ads';
import { billingProviderFor } from '@/server/providers/billing';
import { contextForAdAccount } from '@/server/services/tokens';
import { capabilitiesFor } from '@/server/platform/capabilities';
import { signedMediaUrls } from '@/server/services/storage';
import { checkSpendLimits } from '@/server/services/billing';
import { idempotencyKey } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { AppError, normalizeError, NotSupportedError, ValidationError } from '@/lib/errors';
import type {
  AdCampaign, AdSet, ContentAsset, Creative, SocialAccount,
} from '@/types/models';
import type { PlacementSpec, TargetingSpec } from '@/server/providers/types';

export interface PublishCampaignResult {
  campaignId: string;
  campaignExternalId: string;
  adSetExternalId: string;
  creativeExternalId: string;
  adExternalId: string;
  externalUrl?: string;
}

export async function publishCampaign(args: {
  campaignId: string;
  userId: string;
}): Promise<PublishCampaignResult> {
  const db = createAdminSupabase();
  const operation = 'publicacao de campanha';

  const { data: campaignRow } = await db
    .from('ad_campaigns').select('*').eq('id', args.campaignId).maybeSingle();
  if (!campaignRow) {
    throw new AppError({
      code: 'CAMPAIGN_NOT_FOUND', operation, step: 'localizacao da campanha',
      message: `Campanha ${args.campaignId} nao encontrada.`, status: 404,
    });
  }
  const campaign = campaignRow as AdCampaign;

  if (campaign.status === 'ACTIVE' || campaign.status === 'PAUSED') {
    if (campaign.external_id) {
      return {
        campaignId: campaign.id,
        campaignExternalId: campaign.external_id,
        adSetExternalId: '',
        creativeExternalId: '',
        adExternalId: '',
        externalUrl: campaign.external_url ?? undefined,
      };
    }
  }

  const capabilities = capabilitiesFor(campaign.platform);
  if (capabilities.ads.operations.publish !== 'SUPPORTED') {
    throw new NotSupportedError({
      operation,
      platform: capabilities.label,
      reason: 'O conector de anuncios desta plataforma nao esta disponivel no NojAds.',
      docsUrl: capabilities.docsUrl,
    });
  }

  if (campaign.requires_approval && !campaign.approved_at) {
    throw new ValidationError({
      operation,
      step: 'verificacao de aprovacao',
      message: 'Esta campanha exige aprovacao e ainda nao foi aprovada.',
      hint: 'Aprove a campanha em Ads Manager > Aprovacoes antes de publicar.',
    });
  }

  const { data: adSetRow } = await db
    .from('ad_sets').select('*').eq('campaign_id', campaign.id)
    .order('created_at').limit(1).maybeSingle();
  if (!adSetRow) {
    throw new ValidationError({
      operation, step: 'validacao da estrutura',
      message: 'A campanha nao tem conjunto de anuncios.',
      hint: 'Volte ao formulario e complete o publico e o orcamento.',
    });
  }
  const adSet = adSetRow as AdSet;

  const { data: adRow } = await db
    .from('ads').select('*').eq('campaign_id', campaign.id)
    .order('created_at').limit(1).maybeSingle();
  if (!adRow?.creative_id) {
    throw new ValidationError({
      operation, step: 'validacao da estrutura',
      message: 'A campanha nao tem anuncio nem criativo associados.',
      hint: 'Volte ao formulario e complete o criativo.',
    });
  }

  const { data: creativeRow } = await db
    .from('creatives').select('*').eq('id', adRow.creative_id).single();
  const creative = creativeRow as Creative;

  const budget = Number(campaign.daily_budget ?? adSet.daily_budget ?? 0);
  const lifetime = Number(campaign.lifetime_budget ?? adSet.lifetime_budget ?? 0);
  await checkSpendLimits({
    clientId: campaign.client_id,
    amount: lifetime > 0 ? lifetime : budget,
    currency: campaign.currency,
    campaignId: campaign.id,
    operation,
  });

  const provider = adsProviderFor(campaign.platform);
  const ctx = await contextForAdAccount(campaign.ad_account_id);

  // Refuse to publish onto an account the platform says cannot spend.
  const billing = billingProviderFor(campaign.platform);
  if (billing.isConfigured() && ctx.adAccount) {
    try {
      const snapshot = await billing.getSnapshot(ctx, ctx.adAccount.external_id);
      if (!snapshot.canSpend) {
        throw new AppError({
          code: 'AD_ACCOUNT_CANNOT_SPEND',
          operation,
          step: 'validacao da faturacao da conta publicitaria',
          message: snapshot.reason ?? 'A conta publicitaria nao esta apta a gastar.',
          hint: 'Regularize a faturacao no painel oficial da plataforma e tente novamente.',
          status: 409,
        });
      }
    } catch (err) {
      // Only a real "cannot spend" blocks; a read failure is logged, not fatal.
      if (err instanceof AppError && err.code === 'AD_ACCOUNT_CANNOT_SPEND') throw err;
      await logger.warn({
        channel: 'BILLING', action: 'campaign.billing_check_skipped',
        clientId: campaign.client_id, campaignId: campaign.id, error: err,
      });
    }
  }

  await db.from('ad_campaigns').update({ status: 'PUBLISHING' }).eq('id', campaign.id);

  try {
    // 1. Campaign — reuse the external id if a previous attempt got this far.
    let campaignExternalId = campaign.external_id;
    if (!campaignExternalId) {
      const ref = await provider.createCampaign(ctx, {
        name: campaign.name,
        objective: campaign.objective,
        dailyBudget: campaign.daily_budget ?? undefined,
        lifetimeBudget: campaign.lifetime_budget ?? undefined,
        budgetLevel: campaign.budget_level,
        bidStrategy: campaign.bid_strategy ?? undefined,
        spendCap: campaign.spend_cap ?? undefined,
        specialAdCategories: campaign.special_ad_categories,
        startsAt: campaign.starts_at ?? undefined,
        endsAt: campaign.ends_at ?? undefined,
        status: 'PAUSED',
        idempotencyKey: idempotencyKey('camp', campaign.id),
      });
      campaignExternalId = ref.externalId;
      await db.from('ad_campaigns')
        .update({ external_id: campaignExternalId }).eq('id', campaign.id);
    }

    // 2. Ad set.
    let adSetExternalId = adSet.external_id;
    if (!adSetExternalId) {
      const ref = await provider.createAdSet(ctx, {
        name: adSet.name,
        campaignExternalId,
        optimizationGoal: adSet.optimization_goal ?? 'LINK_CLICKS',
        billingEvent: adSet.billing_event ?? 'IMPRESSIONS',
        bidAmount: adSet.bid_amount ?? undefined,
        dailyBudget: adSet.daily_budget ?? undefined,
        lifetimeBudget: adSet.lifetime_budget ?? undefined,
        startsAt: adSet.starts_at ?? undefined,
        endsAt: adSet.ends_at ?? undefined,
        targeting: adSet.targeting as TargetingSpec,
        placements: adSet.placements as unknown as PlacementSpec,
        promotedObject: (adSet.promoted_object as Record<string, unknown>) ?? undefined,
        idempotencyKey: idempotencyKey('adset', adSet.id),
      });
      adSetExternalId = ref.externalId;
      await db.from('ad_sets').update({ external_id: adSetExternalId }).eq('id', adSet.id);
    }

    // 3. Creative.
    let creativeExternalId = creative.external_id;
    if (!creativeExternalId) {
      const { data: assetRows } = await db
        .from('content_assets').select('*').in('id', creative.asset_ids ?? []);
      const media = await signedMediaUrls((assetRows ?? []) as ContentAsset[]);

      const pageId = creative.page_external_id ?? await resolvePageId(campaign.client_id);
      const ref = await provider.createCreative(ctx, {
        name: creative.name,
        format: creative.format,
        primaryText: creative.primary_text ?? '',
        headline: creative.headline ?? undefined,
        description: creative.description ?? undefined,
        callToAction: creative.call_to_action ?? undefined,
        destinationUrl: creative.destination_url ?? undefined,
        pageExternalId: pageId,
        instagramExternalId: creative.instagram_external_id ?? undefined,
        media,
        idempotencyKey: idempotencyKey('creative', creative.id),
      });
      creativeExternalId = ref.externalId;
      await db.from('creatives').update({ external_id: creativeExternalId }).eq('id', creative.id);
    }

    // 4. Ad.
    let adExternalId = adRow.external_id;
    let adExternalUrl = adRow.external_url;
    if (!adExternalId) {
      const ref = await provider.createAd(ctx, {
        name: adRow.name,
        adSetExternalId,
        creativeExternalId,
        status: 'PAUSED',
        idempotencyKey: idempotencyKey('ad', adRow.id),
      });
      adExternalId = ref.externalId;
      adExternalUrl = ref.externalUrl ?? null;
      await db.from('ads').update({
        external_id: adExternalId, external_url: adExternalUrl, status: 'PAUSED',
      }).eq('id', adRow.id);
    }

    // Everything confirmed by the platform. PAUSED, deliberately: publishing
    // built the structure; a person still has to start the spend.
    await db.from('ad_campaigns').update({
      status: 'PAUSED',
      external_status: 'PAUSED',
      external_url: `https://business.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${campaignExternalId}`,
      published_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', campaign.id);
    await db.from('ad_sets').update({ status: 'PAUSED' }).eq('id', adSet.id);

    await logger.info({
      channel: 'ADS', action: 'campaign.published',
      message: `Campanha "${campaign.name}" criada em ${campaign.platform} (${campaignExternalId}), em pausa.`,
      clientId: campaign.client_id, campaignId: campaign.id, userId: args.userId,
    });

    await db.from('notifications').insert({
      client_id: campaign.client_id,
      type: 'CAMPAIGN_PUBLISHED',
      severity: 'SUCCESS',
      title: `Campanha criada: ${campaign.name}`,
      body: 'A campanha foi criada na plataforma e esta EM PAUSA. Ative-a quando quiser comecar a investir.',
      link: `/ads/${campaign.id}`,
    });

    return {
      campaignId: campaign.id,
      campaignExternalId,
      adSetExternalId,
      creativeExternalId,
      adExternalId,
      externalUrl: adExternalUrl ?? undefined,
    };
  } catch (err) {
    const appError = normalizeError(err, operation);
    await db.from('ad_campaigns').update({
      status: 'FAILED', last_error: appError.toJSON(),
    }).eq('id', campaign.id);

    await logger.error({
      channel: 'ADS', action: 'campaign.publish_failed',
      message: appError.toDisplay(),
      clientId: campaign.client_id, campaignId: campaign.id, userId: args.userId, error: appError,
    });

    await db.from('notifications').insert({
      client_id: campaign.client_id,
      type: 'CAMPAIGN_PUBLISH_FAILED',
      severity: 'ERROR',
      title: `Falha ao publicar a campanha "${campaign.name}"`,
      body: appError.toDisplay(),
      link: `/ads/${campaign.id}`,
    });

    throw appError;
  }
}

/** Meta requires a Page on every ad creative. */
async function resolvePageId(clientId: string): Promise<string | undefined> {
  const db = createAdminSupabase();
  const { data } = await db
    .from('social_accounts').select('external_id')
    .eq('client_id', clientId).eq('platform', 'FACEBOOK').eq('status', 'CONNECTED')
    .limit(1).maybeSingle();
  return (data as Pick<SocialAccount, 'external_id'> | null)?.external_id;
}

export async function setCampaignState(args: {
  campaignId: string;
  action: 'PAUSE' | 'RESUME';
  userId: string;
}): Promise<void> {
  const db = createAdminSupabase();
  const operation = args.action === 'PAUSE' ? 'pausa de campanha' : 'retoma de campanha';

  const { data: campaignRow } = await db
    .from('ad_campaigns').select('*').eq('id', args.campaignId).maybeSingle();
  if (!campaignRow) {
    throw new AppError({
      code: 'CAMPAIGN_NOT_FOUND', operation, step: 'localizacao da campanha',
      message: 'Campanha nao encontrada.', status: 404,
    });
  }
  const campaign = campaignRow as AdCampaign;

  if (!campaign.external_id) {
    // Local-only campaign: nothing to tell the platform.
    await db.from('ad_campaigns')
      .update({ status: args.action === 'PAUSE' ? 'PAUSED' : 'DRAFT' }).eq('id', campaign.id);
    return;
  }

  const provider = adsProviderFor(campaign.platform);
  const ctx = await contextForAdAccount(campaign.ad_account_id);

  if (args.action === 'PAUSE') await provider.pauseCampaign(ctx, campaign.external_id);
  else await provider.resumeCampaign(ctx, campaign.external_id);

  // Only after the platform confirms.
  await db.from('ad_campaigns').update({
    status: args.action === 'PAUSE' ? 'PAUSED' : 'ACTIVE',
    external_status: args.action === 'PAUSE' ? 'PAUSED' : 'ACTIVE',
    last_synced_at: new Date().toISOString(),
  }).eq('id', campaign.id);

  await logger.info({
    channel: 'ADS',
    action: args.action === 'PAUSE' ? 'campaign.paused' : 'campaign.resumed',
    clientId: campaign.client_id, campaignId: campaign.id, userId: args.userId,
  });
}
