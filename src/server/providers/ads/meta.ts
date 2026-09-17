import 'server-only';
/**
 * Meta Marketing API.
 *
 * The object graph is Campaign > Ad Set > Ad, with the creative attached to the
 * ad. Everything is created PAUSED: NojAds never starts spending on its own.
 * Budgets are sent to Meta in minor units (cents), which is a frequent source
 * of 100x mistakes, so the conversion happens in exactly one place here.
 */
import { graph, graphPaged, metaConfig } from '@/server/providers/meta/client';
import { capabilitiesFor, selectablePlacements } from '@/server/platform/capabilities';
import { ProviderError, ValidationError } from '@/lib/errors';
import type {
  AdDraft, AdSetDraft, AdsProvider, CampaignDraft, CampaignMetrics, CreativeDraft,
  ExternalRef, ProviderContext, RemoteAdAccount, RemoteCampaign,
} from '@/server/providers/types';

/** Currencies Meta bills in whole units — no cents. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'CLP', 'VND', 'ISK', 'HUF', 'TWD']);

export function toMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}

export function fromMinorUnits(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? amount : amount / 100;
}

function accountPath(externalId: string): string {
  return externalId.startsWith('act_') ? externalId : `act_${externalId}`;
}

export class MetaAdsProvider implements AdsProvider {
  readonly platform = 'FACEBOOK' as const;
  get capabilities() { return capabilitiesFor('FACEBOOK'); }

  isConfigured() { return metaConfig().isConfigured; }
  missingConfiguration() { return metaConfig().missing; }

  // -------------------------------------------------------- ad accounts

  async getAdAccounts(accessToken: string): Promise<RemoteAdAccount[]> {
    const rows = await graphPaged<Record<string, unknown>>({
      path: '/me/adaccounts',
      accessToken,
      operation: 'descoberta de contas publicitarias',
      step: 'listagem na Meta',
      params: {
        fields: 'id,account_id,name,currency,timezone_name,account_status,business{id,name},' +
                'funding_source_details,spend_cap,amount_spent,disable_reason',
      },
    });
    return rows.map((row) => this.mapAdAccount(row));
  }

  async getAdAccount(ctx: ProviderContext, externalId: string): Promise<RemoteAdAccount> {
    const row = await graph<Record<string, unknown>>({
      path: `/${accountPath(externalId)}`,
      accessToken: ctx.accessToken,
      operation: 'leitura da conta publicitaria',
      step: 'consulta na Meta',
      params: {
        fields: 'id,account_id,name,currency,timezone_name,account_status,business{id,name},' +
                'funding_source_details,spend_cap,amount_spent,disable_reason',
      },
    });
    return this.mapAdAccount(row);
  }

  private mapAdAccount(row: Record<string, unknown>): RemoteAdAccount {
    const currency = String(row.currency ?? 'USD');
    const business = row.business as { id?: string; name?: string } | undefined;
    const funding = row.funding_source_details as { type?: number; display_string?: string } | undefined;
    return {
      externalId: String(row.id ?? `act_${row.account_id}`),
      name: String(row.name ?? 'Conta publicitaria'),
      currency,
      timezone: row.timezone_name ? String(row.timezone_name) : undefined,
      accountStatus: this.accountStatusLabel(Number(row.account_status ?? 0)),
      businessId: business?.id,
      businessName: business?.name,
      fundingSource: funding?.display_string,
      spendCap: row.spend_cap ? fromMinorUnits(Number(row.spend_cap), currency) : undefined,
      amountSpent: row.amount_spent ? fromMinorUnits(Number(row.amount_spent), currency) : undefined,
      raw: row,
    };
  }

  private accountStatusLabel(code: number): string {
    switch (code) {
      case 1: return 'ACTIVE';
      case 2: return 'DISABLED';
      case 3: return 'UNSETTLED';
      case 7: return 'PENDING_RISK_REVIEW';
      case 8: return 'PENDING_SETTLEMENT';
      case 9: return 'IN_GRACE_PERIOD';
      case 100: return 'PENDING_CLOSURE';
      case 101: return 'CLOSED';
      case 201: return 'ANY_ACTIVE';
      case 202: return 'ANY_CLOSED';
      default: return `UNKNOWN_${code}`;
    }
  }

  // ---------------------------------------------------------- campaigns

  async getCampaigns(ctx: ProviderContext): Promise<RemoteCampaign[]> {
    const accountId = this.requireAccount(ctx, 'listagem de campanhas');
    const rows = await graphPaged<Record<string, unknown>>({
      path: `/${accountPath(accountId)}/campaigns`,
      accessToken: ctx.accessToken,
      operation: 'listagem de campanhas',
      step: 'consulta na Meta',
      params: {
        fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,' +
                'start_time,stop_time,created_time,updated_time,bid_strategy',
      },
    });
    const currency = ctx.adAccount?.currency ?? 'USD';
    return rows.map((row) => this.mapCampaign(row, currency));
  }

  async getCampaign(ctx: ProviderContext, externalId: string): Promise<RemoteCampaign> {
    const row = await graph<Record<string, unknown>>({
      path: `/${externalId}`,
      accessToken: ctx.accessToken,
      operation: 'leitura de campanha',
      step: 'consulta na Meta',
      params: {
        fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,' +
                'start_time,stop_time,bid_strategy',
      },
    });
    return this.mapCampaign(row, ctx.adAccount?.currency ?? 'USD');
  }

  private mapCampaign(row: Record<string, unknown>, currency: string): RemoteCampaign {
    return {
      externalId: String(row.id),
      name: String(row.name ?? ''),
      objective: String(row.objective ?? ''),
      status: String(row.effective_status ?? row.status ?? 'UNKNOWN'),
      dailyBudget: row.daily_budget ? fromMinorUnits(Number(row.daily_budget), currency) : undefined,
      lifetimeBudget: row.lifetime_budget ? fromMinorUnits(Number(row.lifetime_budget), currency) : undefined,
      currency,
      startsAt: row.start_time ? String(row.start_time) : undefined,
      endsAt: row.stop_time ? String(row.stop_time) : undefined,
      raw: row,
    };
  }

  async createCampaign(ctx: ProviderContext, draft: CampaignDraft): Promise<ExternalRef> {
    const operation = 'criacao de campanha';
    const accountId = this.requireAccount(ctx, operation);
    const currency = ctx.adAccount?.currency ?? 'USD';

    const objective = this.capabilities.ads.objectives.find((o) => o.value === draft.objective);
    if (!objective || objective.support !== 'SUPPORTED') {
      throw new ValidationError({
        operation,
        step: 'validacao do objetivo',
        message: `O objetivo "${draft.objective}" nao esta disponivel para a Meta no NojAds.`,
        hint: 'Escolha um dos objetivos listados no formulario — sao exatamente os que a API oficial aceita.',
      });
    }

    const params: Record<string, string | number | boolean> = {
      name: draft.name,
      objective: draft.objective,
      status: 'PAUSED',
      special_ad_categories: JSON.stringify(draft.specialAdCategories ?? []),
    };
    if (draft.budgetLevel === 'CAMPAIGN') {
      if (draft.dailyBudget) params.daily_budget = toMinorUnits(draft.dailyBudget, currency);
      if (draft.lifetimeBudget) params.lifetime_budget = toMinorUnits(draft.lifetimeBudget, currency);
      if (draft.bidStrategy) params.bid_strategy = draft.bidStrategy;
    }
    if (draft.spendCap) params.spend_cap = toMinorUnits(draft.spendCap, currency);
    if (draft.startsAt) params.start_time = draft.startsAt;
    if (draft.endsAt) params.stop_time = draft.endsAt;

    const result = await graph<{ id?: string }>({
      path: `/${accountPath(accountId)}/campaigns`,
      method: 'POST',
      accessToken: ctx.accessToken,
      operation,
      step: 'criacao do objeto Campaign na Meta',
      idempotencyKey: draft.idempotencyKey,
      params,
    });

    return this.requireId(result, operation, 'campanha');
  }

  async createAdSet(ctx: ProviderContext, draft: AdSetDraft): Promise<ExternalRef> {
    const operation = 'criacao de conjunto de anuncios';
    const accountId = this.requireAccount(ctx, operation);
    const currency = ctx.adAccount?.currency ?? 'USD';

    const params: Record<string, string | number | boolean> = {
      name: draft.name,
      campaign_id: draft.campaignExternalId,
      status: 'PAUSED',
      optimization_goal: draft.optimizationGoal,
      billing_event: draft.billingEvent,
      targeting: JSON.stringify(this.buildTargeting(draft)),
    };
    if (draft.dailyBudget) params.daily_budget = toMinorUnits(draft.dailyBudget, currency);
    if (draft.lifetimeBudget) params.lifetime_budget = toMinorUnits(draft.lifetimeBudget, currency);
    if (draft.bidAmount) params.bid_amount = toMinorUnits(draft.bidAmount, currency);
    if (draft.startsAt) params.start_time = draft.startsAt;
    if (draft.endsAt) params.end_time = draft.endsAt;
    if (draft.promotedObject) params.promoted_object = JSON.stringify(draft.promotedObject);

    if (draft.lifetimeBudget && !draft.endsAt) {
      throw new ValidationError({
        operation,
        step: 'validacao do orcamento',
        message: 'Um orcamento total exige uma data de fim.',
        hint: 'Defina a data de fim da campanha ou mude para orcamento diario.',
      });
    }

    const result = await graph<{ id?: string }>({
      path: `/${accountPath(accountId)}/adsets`,
      method: 'POST',
      accessToken: ctx.accessToken,
      operation,
      step: 'criacao do objeto AdSet na Meta',
      idempotencyKey: draft.idempotencyKey,
      params,
    });

    return this.requireId(result, operation, 'conjunto de anuncios');
  }

  /** Translates the NojAds targeting shape into Meta's `targeting` spec. */
  private buildTargeting(draft: AdSetDraft): Record<string, unknown> {
    const t = draft.targeting;
    const targeting: Record<string, unknown> = {
      geo_locations: {
        countries: t.countries?.length ? t.countries : ['AO'],
        ...(t.cities?.length
          ? { cities: t.cities.map((c) => ({ key: c.key, radius: c.radiusKm ?? 25, distance_unit: 'kilometer' })) }
          : {}),
      },
      age_min: t.ageMin ?? 18,
      age_max: t.ageMax ?? 65,
    };

    if (t.genders?.length && !t.genders.includes('ALL')) {
      targeting.genders = t.genders.map((g) => (g === 'MALE' ? 1 : 2));
    }
    if (t.languages?.length) targeting.locales = t.languages;
    if (t.interests?.length) {
      targeting.flexible_spec = [{ interests: t.interests.map((i) => ({ id: i.id, name: i.name })) }];
    }
    if (t.behaviors?.length) {
      const spec = (targeting.flexible_spec as Record<string, unknown>[] | undefined) ?? [];
      spec.push({ behaviors: t.behaviors.map((b) => ({ id: b.id, name: b.name })) });
      targeting.flexible_spec = spec;
    }
    if (t.customAudienceIds?.length) {
      targeting.custom_audiences = t.customAudienceIds.map((id) => ({ id }));
    }
    if (t.excludedCustomAudienceIds?.length) {
      targeting.excluded_custom_audiences = t.excludedCustomAudienceIds.map((id) => ({ id }));
    }

    if (draft.placements.mode === 'MANUAL' && draft.placements.selected?.length) {
      const allowed = new Set(selectablePlacements('FACEBOOK').map((p) => p.value));
      const chosen = draft.placements.selected.filter((p) => allowed.has(p));
      const publishers = new Set<string>();
      const positionsByPublisher: Record<string, string[]> = {};
      for (const entry of chosen) {
        const [publisher, position] = entry.split(':');
        publishers.add(publisher);
        (positionsByPublisher[publisher] ??= []).push(position);
      }
      targeting.publisher_platforms = [...publishers];
      if (positionsByPublisher.facebook) targeting.facebook_positions = positionsByPublisher.facebook;
      if (positionsByPublisher.instagram) targeting.instagram_positions = positionsByPublisher.instagram;
      if (positionsByPublisher.messenger) targeting.messenger_positions = positionsByPublisher.messenger;
      if (positionsByPublisher.audience_network) targeting.audience_network_positions = positionsByPublisher.audience_network;
    }

    return targeting;
  }

  async createCreative(ctx: ProviderContext, draft: CreativeDraft): Promise<ExternalRef> {
    const operation = 'criacao de criativo';
    const accountId = this.requireAccount(ctx, operation);

    if (!draft.pageExternalId) {
      throw new ValidationError({
        operation,
        step: 'validacao do criativo',
        message: 'A Meta exige uma Pagina do Facebook associada ao anuncio.',
        hint: 'Conecte a Pagina do cliente em Redes Sociais e selecione-a no formulario do anuncio.',
      });
    }
    if (draft.media.length === 0) {
      throw new ValidationError({
        operation,
        step: 'validacao do criativo',
        message: 'Um criativo precisa de pelo menos uma imagem ou video.',
      });
    }

    const linkData: Record<string, unknown> = {
      message: draft.primaryText,
      link: draft.destinationUrl ?? 'https://facebook.com',
      name: draft.headline,
      description: draft.description,
    };
    if (draft.callToAction && draft.callToAction !== 'NO_BUTTON') {
      linkData.call_to_action = {
        type: draft.callToAction,
        value: { link: draft.destinationUrl ?? 'https://facebook.com' },
      };
    }

    const objectStorySpec: Record<string, unknown> = { page_id: draft.pageExternalId };
    if (draft.instagramExternalId) objectStorySpec.instagram_actor_id = draft.instagramExternalId;

    if (draft.format === 'SINGLE_VIDEO') {
      const video = draft.media.find((m) => m.kind === 'VIDEO');
      if (!video) {
        throw new ValidationError({
          operation, step: 'validacao do criativo',
          message: 'Formato "video unico" selecionado mas nenhum video foi anexado.',
        });
      }
      const uploaded = await graph<{ id?: string }>({
        path: `/${accountPath(accountId)}/advideos`,
        method: 'POST',
        accessToken: ctx.accessToken,
        operation,
        step: 'envio do video para a biblioteca da conta publicitaria',
        params: { file_url: video.url, name: draft.name },
      });
      if (!uploaded.id) {
        throw new ProviderError({
          operation, step: 'envio do video', provider: 'Meta',
          platformMessage: 'A Meta nao devolveu o identificador do video.',
        });
      }
      objectStorySpec.video_data = {
        video_id: uploaded.id,
        message: draft.primaryText,
        title: draft.headline,
        link_description: draft.description,
        image_url: video.thumbnailUrl,
        ...(draft.callToAction && draft.callToAction !== 'NO_BUTTON'
          ? { call_to_action: { type: draft.callToAction, value: { link: draft.destinationUrl } } }
          : {}),
      };
    } else if (draft.format === 'CAROUSEL') {
      objectStorySpec.link_data = {
        ...linkData,
        child_attachments: draft.media.slice(0, 10).map((m) => ({
          link: draft.destinationUrl ?? 'https://facebook.com',
          picture: m.url,
          name: m.caption ?? draft.headline,
        })),
        multi_share_optimized: true,
      };
    } else {
      objectStorySpec.link_data = { ...linkData, picture: draft.media[0].url };
    }

    const result = await graph<{ id?: string }>({
      path: `/${accountPath(accountId)}/adcreatives`,
      method: 'POST',
      accessToken: ctx.accessToken,
      operation,
      step: 'criacao do AdCreative na Meta',
      idempotencyKey: draft.idempotencyKey,
      params: { name: draft.name, object_story_spec: JSON.stringify(objectStorySpec) },
    });

    return this.requireId(result, operation, 'criativo');
  }

  async createAd(ctx: ProviderContext, draft: AdDraft): Promise<ExternalRef> {
    const operation = 'criacao de anuncio';
    const accountId = this.requireAccount(ctx, operation);

    const result = await graph<{ id?: string }>({
      path: `/${accountPath(accountId)}/ads`,
      method: 'POST',
      accessToken: ctx.accessToken,
      operation,
      step: 'criacao do objeto Ad na Meta',
      idempotencyKey: draft.idempotencyKey,
      params: {
        name: draft.name,
        adset_id: draft.adSetExternalId,
        creative: JSON.stringify({ creative_id: draft.creativeExternalId }),
        status: 'PAUSED',
      },
    });

    const ref = this.requireId(result, operation, 'anuncio');
    return { ...ref, externalUrl: `https://business.facebook.com/adsmanager/manage/ads?selected_ad_ids=${ref.externalId}` };
  }

  // ------------------------------------------------------- state changes

  async pauseCampaign(ctx: ProviderContext, externalId: string): Promise<void> {
    await this.setStatus(ctx, externalId, 'PAUSED', 'pausa de campanha');
  }

  async resumeCampaign(ctx: ProviderContext, externalId: string): Promise<void> {
    await this.setStatus(ctx, externalId, 'ACTIVE', 'retoma de campanha');
  }

  private async setStatus(ctx: ProviderContext, externalId: string, status: string, operation: string) {
    const result = await graph<{ success?: boolean }>({
      path: `/${externalId}`,
      method: 'POST',
      accessToken: ctx.accessToken,
      operation,
      step: 'atualizacao do estado na Meta',
      params: { status },
    });
    if (result.success === false) {
      throw new ProviderError({
        operation, step: 'confirmacao da alteracao', provider: 'Meta',
        platformMessage: 'A Meta recusou a alteracao de estado.',
      });
    }
  }

  async updateCampaign(ctx: ProviderContext, externalId: string, patch: Partial<CampaignDraft>): Promise<void> {
    const currency = ctx.adAccount?.currency ?? 'USD';
    const params: Record<string, string | number> = {};
    if (patch.name) params.name = patch.name;
    if (patch.dailyBudget !== undefined) params.daily_budget = toMinorUnits(patch.dailyBudget, currency);
    if (patch.lifetimeBudget !== undefined) params.lifetime_budget = toMinorUnits(patch.lifetimeBudget, currency);
    if (patch.spendCap !== undefined) params.spend_cap = toMinorUnits(patch.spendCap, currency);
    if (patch.bidStrategy) params.bid_strategy = patch.bidStrategy;
    if (patch.endsAt) params.stop_time = patch.endsAt;

    if (Object.keys(params).length === 0) return;

    await graph({
      path: `/${externalId}`,
      method: 'POST',
      accessToken: ctx.accessToken,
      operation: 'atualizacao de campanha',
      step: 'envio das alteracoes para a Meta',
      params,
    });
  }

  async deleteCampaign(ctx: ProviderContext, externalId: string): Promise<void> {
    await graph({
      path: `/${externalId}`,
      method: 'DELETE',
      accessToken: ctx.accessToken,
      operation: 'eliminacao de campanha',
      step: 'eliminacao na Meta',
    });
  }

  // ------------------------------------------------------------ metrics

  async getCampaignMetrics(
    ctx: ProviderContext,
    args: { externalIds: string[]; since: string; until: string },
  ): Promise<CampaignMetrics[]> {
    const out: CampaignMetrics[] = [];
    for (const externalId of args.externalIds) {
      const rows = await graphPaged<Record<string, unknown>>({
        path: `/${externalId}/insights`,
        accessToken: ctx.accessToken,
        operation: 'sincronizacao de metricas de campanha',
        step: 'leitura de insights na Meta',
        params: {
          fields: 'impressions,reach,clicks,spend,ctr,cpc,cpm,actions,cost_per_action_type,video_thruplay_watched_actions',
          time_range: JSON.stringify({ since: args.since, until: args.until }),
          time_increment: 1,
          level: 'campaign',
        },
      });

      for (const row of rows) {
        const actions = (row.actions as { action_type: string; value: string }[] | undefined) ?? [];
        const conversions = actions
          .filter((a) => a.action_type.includes('purchase') || a.action_type.includes('lead') ||
                         a.action_type === 'offsite_conversion')
          .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
        const thruplays = (row.video_thruplay_watched_actions as { value: string }[] | undefined)?.[0];

        out.push({
          externalId,
          date: String(row.date_start ?? args.since),
          impressions: Number(row.impressions ?? 0),
          reach: Number(row.reach ?? 0),
          clicks: Number(row.clicks ?? 0),
          spend: Number(row.spend ?? 0),
          currency: ctx.adAccount?.currency ?? 'USD',
          ctr: row.ctr !== undefined ? Number(row.ctr) : undefined,
          cpc: row.cpc !== undefined ? Number(row.cpc) : undefined,
          cpm: row.cpm !== undefined ? Number(row.cpm) : undefined,
          conversions,
          videoViews: thruplays ? Number(thruplays.value) : undefined,
          raw: row,
        });
      }
    }
    return out;
  }

  // ------------------------------------------------------------ helpers

  private requireAccount(ctx: ProviderContext, operation: string): string {
    const externalId = ctx.adAccount?.external_id;
    if (!externalId) {
      throw new ValidationError({
        operation,
        step: 'validacao da conta publicitaria',
        message: 'Nenhuma conta publicitaria foi selecionada.',
        hint: 'Escolha a conta publicitaria do cliente antes de continuar.',
      });
    }
    return externalId;
  }

  private requireId(result: { id?: string }, operation: string, label: string): ExternalRef {
    if (!result.id) {
      throw new ProviderError({
        operation,
        step: 'confirmacao da resposta da Meta',
        provider: 'Meta',
        platformMessage: `A Meta respondeu sem devolver o identificador do ${label}.`,
        hint: 'Nada foi dado como criado. Verifique no Gestor de Anuncios antes de repetir a operacao.',
      });
    }
    return { externalId: result.id, raw: result as Record<string, unknown> };
  }
}
