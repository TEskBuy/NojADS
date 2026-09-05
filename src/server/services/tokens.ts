import 'server-only';
/**
 * Token vault access.
 *
 * The only module that reads social_tokens. Everything else asks for a
 * ProviderContext and gets a decrypted token that never leaves the server.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { AppError, NotFoundError } from '@/lib/errors';
import type { ProviderContext } from '@/server/providers/types';
import type { AdAccount, SocialAccount } from '@/types/models';

export interface StoredTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string | null;
  scopes: string[];
}

export async function saveTokens(socialAccountId: string, tokens: {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: string;
  refreshExpiresAt?: string;
  scopes: string[];
}): Promise<void> {
  const db = createAdminSupabase();
  const { error } = await db.from('social_tokens').upsert({
    social_account_id: socialAccountId,
    access_token_cipher: encryptSecret(tokens.accessToken),
    refresh_token_cipher: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null,
    token_type: tokens.tokenType ?? 'bearer',
    scopes: tokens.scopes,
    expires_at: tokens.expiresAt ?? null,
    refresh_expires_at: tokens.refreshExpiresAt ?? null,
    last_refreshed_at: new Date().toISOString(),
    refresh_failures: 0,
  }, { onConflict: 'social_account_id' });

  if (error) {
    throw new AppError({
      code: 'TOKEN_SAVE_FAILED',
      operation: 'guardar token',
      step: 'escrita no cofre',
      message: error.message,
      status: 500,
    });
  }
}

export async function readTokens(socialAccountId: string): Promise<StoredTokenSet> {
  const db = createAdminSupabase();
  const { data } = await db
    .from('social_tokens').select('*').eq('social_account_id', socialAccountId).maybeSingle();

  if (!data) {
    throw new NotFoundError({
      operation: 'leitura de token',
      resource: 'Token da conta social',
      id: socialAccountId,
    });
  }

  return {
    accessToken: decryptSecret(data.access_token_cipher),
    refreshToken: data.refresh_token_cipher ? decryptSecret(data.refresh_token_cipher) : undefined,
    expiresAt: data.expires_at,
    scopes: data.scopes ?? [],
  };
}

/**
 * Builds a ProviderContext for a social account.
 *
 * For Meta, publishing uses the Page access token stored in the account's
 * metadata rather than the user token — that is what the Graph API expects.
 */
export async function contextForSocialAccount(socialAccountId: string): Promise<ProviderContext> {
  const db = createAdminSupabase();
  const { data: account } = await db
    .from('social_accounts').select('*').eq('id', socialAccountId).maybeSingle();

  if (!account) {
    throw new NotFoundError({
      operation: 'acesso a conta social', resource: 'Conta social', id: socialAccountId,
    });
  }

  const stored = await readTokens(socialAccountId);
  const metadata = (account.metadata ?? {}) as Record<string, unknown>;
  const pageTokenCipher = metadata.page_access_token_cipher as string | undefined;
  const accessToken = pageTokenCipher ? decryptSecret(pageTokenCipher) : stored.accessToken;

  return {
    clientId: account.client_id,
    accessToken,
    account: account as SocialAccount,
  };
}

/** Builds a ProviderContext for an ad account, using its linked social token. */
export async function contextForAdAccount(adAccountId: string): Promise<ProviderContext> {
  const db = createAdminSupabase();
  const { data: adAccount } = await db
    .from('ad_accounts').select('*').eq('id', adAccountId).maybeSingle();

  if (!adAccount) {
    throw new NotFoundError({
      operation: 'acesso a conta publicitaria', resource: 'Conta publicitaria', id: adAccountId,
    });
  }
  if (!adAccount.social_account_id) {
    throw new AppError({
      code: 'AD_ACCOUNT_NOT_LINKED',
      operation: 'acesso a conta publicitaria',
      step: 'localizacao do token',
      message: 'Esta conta publicitaria nao esta ligada a nenhuma conta social conectada.',
      hint: 'Reconecte a plataforma em Redes Sociais para restabelecer a ligacao.',
      status: 409,
    });
  }

  // Ads calls use the user token, not the Page token.
  const stored = await readTokens(adAccount.social_account_id);
  return {
    clientId: adAccount.client_id,
    accessToken: stored.accessToken,
    adAccount: adAccount as AdAccount,
  };
}
