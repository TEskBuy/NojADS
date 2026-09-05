import 'server-only';
/**
 * OAuth flow.
 *
 * NojAds never asks for a social network password and never stores one. The
 * only thing that crosses is an authorisation code, exchanged server-side for
 * a token that goes straight into the encrypted vault.
 *
 * The state parameter is single-use and expires in 15 minutes, which is what
 * stops a replayed callback from attaching someone else's account.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { socialProviderFor } from '@/server/providers/social';
import { adsProviderFor } from '@/server/providers/ads';
import { saveTokens } from '@/server/services/tokens';
import { encryptSecret, randomToken } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { AppError, NotConfiguredError, ValidationError } from '@/lib/errors';
import { capabilitiesFor } from '@/server/platform/capabilities';
import type { Platform } from '@/types/models';

export const PLATFORM_BY_SLUG: Record<string, Platform> = {
  meta: 'FACEBOOK',
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  tiktok: 'TIKTOK',
  youtube: 'YOUTUBE',
  google: 'GOOGLE',
  linkedin: 'LINKEDIN',
  x: 'X',
};

export function platformFromSlug(slug: string): Platform {
  const platform = PLATFORM_BY_SLUG[slug.toLowerCase()];
  if (!platform) {
    throw new ValidationError({
      operation: 'ligacao de conta social',
      step: 'identificacao da plataforma',
      message: `Plataforma desconhecida: "${slug}".`,
      hint: `Plataformas validas: ${Object.keys(PLATFORM_BY_SLUG).join(', ')}.`,
    });
  }
  return platform;
}

export async function startOAuth(args: {
  platform: Platform;
  clientId: string;
  userId: string;
  redirectUri: string;
  returnTo?: string;
}): Promise<{ authorizationUrl: string }> {
  const provider = socialProviderFor(args.platform);

  if (!provider.isConfigured()) {
    throw new NotConfiguredError({
      operation: `ligacao de conta ${capabilitiesFor(args.platform).label}`,
      provider: capabilitiesFor(args.platform).label,
      missing: provider.missingConfiguration(),
      docsPath: 'docs/oauth.md',
    });
  }

  const state = randomToken(24);
  const db = createAdminSupabase();

  const { error } = await db.from('oauth_states').insert({
    state,
    platform: args.platform,
    client_id: args.clientId,
    user_id: args.userId,
    redirect_to: args.returnTo ?? '/redes-sociais',
  });
  if (error) {
    throw new AppError({
      code: 'OAUTH_STATE_FAILED',
      operation: 'ligacao de conta social',
      step: 'registo do estado OAuth',
      message: error.message,
      status: 500,
    });
  }

  const result = provider.buildAuthorizationUrl({ state, redirectUri: args.redirectUri });
  return { authorizationUrl: result.authorizationUrl };
}

export interface OAuthCompletion {
  clientId: string;
  redirectTo: string;
  connected: { platform: Platform; externalId: string; displayName?: string }[];
  adAccounts: number;
}

export async function completeOAuth(args: {
  platform: Platform;
  code: string;
  state: string;
  redirectUri: string;
}): Promise<OAuthCompletion> {
  const db = createAdminSupabase();
  const operation = `ligacao de conta ${capabilitiesFor(args.platform).label}`;

  const { data: stateRow } = await db
    .from('oauth_states').select('*').eq('state', args.state).maybeSingle();

  if (!stateRow) {
    throw new ValidationError({
      operation,
      step: 'validacao do estado OAuth',
      message: 'O pedido de autorizacao nao foi reconhecido.',
      hint: 'Recomece a ligacao a partir de Redes Sociais. Nunca abra o link de autorizacao duas vezes.',
    });
  }
  if (stateRow.consumed_at) {
    throw new ValidationError({
      operation,
      step: 'validacao do estado OAuth',
      message: 'Este pedido de autorizacao ja foi usado.',
      hint: 'Recomece a ligacao a partir de Redes Sociais.',
    });
  }
  if (new Date(stateRow.expires_at) < new Date()) {
    throw new ValidationError({
      operation,
      step: 'validacao do estado OAuth',
      message: 'O pedido de autorizacao expirou (validade de 15 minutos).',
      hint: 'Recomece a ligacao a partir de Redes Sociais.',
    });
  }

  // Single use, marked before any network call.
  await db.from('oauth_states')
    .update({ consumed_at: new Date().toISOString() }).eq('state', args.state);

  const provider = socialProviderFor(args.platform);
  const tokens = await provider.exchangeCode({ code: args.code, redirectUri: args.redirectUri });
  const discovered = await provider.discoverAccounts(tokens.accessToken);

  if (discovered.length === 0) {
    throw new ValidationError({
      operation,
      step: 'descoberta de contas',
      message: 'A autorizacao funcionou, mas nenhuma conta elegivel foi encontrada.',
      hint: args.platform === 'INSTAGRAM'
        ? 'O Instagram tem de ser uma conta Business ou Creator ligada a uma Pagina do Facebook. ' +
          'Verifique essa ligacao nas definicoes do Instagram e repita.'
        : 'Confirme que a sua conta e administradora de pelo menos uma Pagina e que aceitou todas as permissoes.',
    });
  }

  const connected: OAuthCompletion['connected'] = [];

  for (const account of discovered) {
    const metadata: Record<string, unknown> = { ...account.metadata };
    // The Page token publishes; encrypt it before it touches a row.
    if (typeof metadata.pageAccessToken === 'string') {
      metadata.page_access_token_cipher = encryptSecret(metadata.pageAccessToken);
      delete metadata.pageAccessToken;
    }

    const { data: saved, error } = await db.from('social_accounts').upsert({
      client_id: stateRow.client_id,
      platform: account.platform,
      external_id: account.externalId,
      username: account.username ?? null,
      display_name: account.displayName ?? null,
      avatar_url: account.avatarUrl ?? null,
      profile_url: account.profileUrl ?? null,
      account_type: account.accountType ?? null,
      parent_external_id: account.parentExternalId ?? null,
      granted_scopes: tokens.scopes,
      status: 'CONNECTED',
      status_reason: null,
      connected_by: stateRow.user_id,
      connected_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
      last_error: null,
      metadata,
    }, { onConflict: 'client_id,platform,external_id' }).select('id').single();

    if (error || !saved) {
      await logger.error({
        channel: 'AUTH', action: 'oauth.account_save_failed',
        message: error?.message, clientId: stateRow.client_id,
      });
      continue;
    }

    await saveTokens(saved.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      expiresAt: tokens.expiresAt,
      refreshExpiresAt: tokens.refreshExpiresAt,
      scopes: tokens.scopes,
    });

    connected.push({
      platform: account.platform,
      externalId: account.externalId,
      displayName: account.displayName,
    });
  }

  // Ad accounts come along with the same authorisation, when the API offers them.
  let adAccountCount = 0;
  const adsProvider = adsProviderFor(args.platform);
  if (adsProvider.capabilities.ads.support === 'SUPPORTED' && adsProvider.isConfigured()) {
    try {
      const remoteAccounts = await adsProvider.getAdAccounts(tokens.accessToken);
      const { data: primary } = await db
        .from('social_accounts').select('id')
        .eq('client_id', stateRow.client_id).eq('platform', args.platform)
        .order('connected_at', { ascending: false }).limit(1).maybeSingle();

      for (const remote of remoteAccounts) {
        await db.from('ad_accounts').upsert({
          client_id: stateRow.client_id,
          social_account_id: primary?.id ?? null,
          platform: args.platform,
          external_id: remote.externalId,
          name: remote.name,
          currency: remote.currency,
          timezone: remote.timezone ?? null,
          business_id: remote.businessId ?? null,
          business_name: remote.businessName ?? null,
          account_status: remote.accountStatus,
          funding_source: remote.fundingSource ?? null,
          spend_cap: remote.spendCap ?? null,
          amount_spent: remote.amountSpent ?? null,
          status: 'CONNECTED',
          last_synced_at: new Date().toISOString(),
          metadata: {},
        }, { onConflict: 'client_id,platform,external_id' });
        adAccountCount += 1;
      }
    } catch (err) {
      // Social publishing still works without ad accounts; say so, don't fail.
      await logger.warn({
        channel: 'AUTH', action: 'oauth.ad_accounts_skipped',
        message: 'Contas sociais ligadas, mas nao foi possivel ler as contas publicitarias.',
        clientId: stateRow.client_id, error: err,
      });
    }
  }

  await db.from('integration_settings')
    .update({ is_configured: true, checked_at: new Date().toISOString() })
    .eq('provider', args.platform === 'INSTAGRAM' || args.platform === 'FACEBOOK' ? 'META' : args.platform);

  await db.from('notifications').insert({
    client_id: stateRow.client_id,
    type: 'ACCOUNT_CONNECTED',
    severity: 'SUCCESS',
    title: `${connected.length} conta(s) ligada(s) em ${capabilitiesFor(args.platform).label}`,
    body: adAccountCount > 0
      ? `Tambem foram detetadas ${adAccountCount} conta(s) publicitaria(s).`
      : undefined,
    link: '/redes-sociais',
  });

  await logger.info({
    channel: 'AUTH', action: 'oauth.completed',
    message: `${connected.length} conta(s) ligada(s), ${adAccountCount} conta(s) publicitaria(s).`,
    clientId: stateRow.client_id, userId: stateRow.user_id,
    metadata: { platform: args.platform },
  });

  return {
    clientId: stateRow.client_id,
    redirectTo: stateRow.redirect_to ?? '/redes-sociais',
    connected,
    adAccounts: adAccountCount,
  };
}

export async function disconnectAccount(args: {
  socialAccountId: string;
  userId: string;
  revokeRemote: boolean;
}): Promise<void> {
  const db = createAdminSupabase();
  const { data: account } = await db
    .from('social_accounts').select('*').eq('id', args.socialAccountId).maybeSingle();
  if (!account) return;

  if (args.revokeRemote) {
    try {
      const { contextForSocialAccount } = await import('@/server/services/tokens');
      const provider = socialProviderFor(account.platform);
      const ctx = await contextForSocialAccount(args.socialAccountId);
      await provider.revoke(ctx);
    } catch (err) {
      // Local disconnect still proceeds; the operator sees why remote failed.
      await logger.warn({
        channel: 'AUTH', action: 'oauth.remote_revoke_failed',
        clientId: account.client_id, error: err,
      });
    }
  }

  // The token row goes; the account row stays so history keeps its references.
  await db.from('social_tokens').delete().eq('social_account_id', args.socialAccountId);
  await db.from('social_accounts').update({
    status: 'DISCONNECTED',
    status_reason: 'Desconectada manualmente no NojAds.',
  }).eq('id', args.socialAccountId);

  await db.from('tasks').update({ status: 'PAUSED', next_run_at: null })
    .eq('social_account_id', args.socialAccountId).eq('status', 'ACTIVE');

  await logger.info({
    channel: 'AUTH', action: 'oauth.disconnected',
    message: 'Conta desconectada. Tarefas dependentes foram pausadas; historico preservado.',
    clientId: account.client_id, userId: args.userId,
  });
}
