'use server';
/** Social and ad account mutations. */
import { revalidatePath } from 'next/cache';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/server/auth/session';
import { disconnectAccount } from '@/server/oauth/flow';
import { socialProviderFor } from '@/server/providers/social';
import { adsProviderFor } from '@/server/providers/ads';
import { contextForSocialAccount, readTokens } from '@/server/services/tokens';
import { enqueue } from '@/server/queue/queue';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import type { ActionState } from './clients';

export async function disconnectAccountAction(socialAccountId: string): Promise<ActionState> {
  try {
    const db = createAdminSupabase();
    const { data: account } = await db
      .from('social_accounts').select('client_id, display_name').eq('id', socialAccountId).maybeSingle();
    if (!account) return { ok: false, message: 'Conta nao encontrada.' };

    const { session } = await requireClientAccess(account.client_id, 'desconexao de conta social', { write: true });
    await disconnectAccount({ socialAccountId, userId: session.userId, revokeRemote: true });

    revalidatePath('/redes-sociais');
    return {
      ok: true,
      message: `${account.display_name ?? 'Conta'} desconectada. As tarefas que a usavam foram pausadas.`,
    };
  } catch (err) {
    const error = normalizeError(err, 'desconexao de conta social');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function verifyAccountAction(socialAccountId: string): Promise<ActionState> {
  try {
    const db = createAdminSupabase();
    const { data: account } = await db
      .from('social_accounts').select('*').eq('id', socialAccountId).maybeSingle();
    if (!account) return { ok: false, message: 'Conta nao encontrada.' };

    await requireClientAccess(account.client_id, 'verificacao de conta social');

    const provider = socialProviderFor(account.platform);
    const ctx = await contextForSocialAccount(socialAccountId);
    const health = await provider.verifyConnection(ctx);

    await db.from('social_accounts').update({
      status: health.healthy ? 'CONNECTED' : 'ERROR',
      status_reason: health.reason ?? null,
      granted_scopes: health.scopes,
      last_checked_at: new Date().toISOString(),
    }).eq('id', socialAccountId);

    revalidatePath('/redes-sociais');
    return health.healthy
      ? { ok: true, message: `Ligacao saudavel. ${health.scopes.length} permissao(oes) concedida(s).` }
      : { ok: false, message: health.reason ?? 'A ligacao tem problemas.', code: 'CONNECTION_UNHEALTHY' };
  } catch (err) {
    const error = normalizeError(err, 'verificacao de conta social');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

/** Re-reads the platform's ad accounts for a client. */
export async function syncAdAccountsAction(clientId: string): Promise<ActionState> {
  try {
    const { session } = await requireClientAccess(clientId, 'sincronizacao de contas publicitarias', { write: true });
    const db = createAdminSupabase();

    const { data: accounts } = await db
      .from('social_accounts').select('id, platform')
      .eq('client_id', clientId).eq('status', 'CONNECTED');

    let imported = 0;
    const skipped: string[] = [];

    for (const account of (accounts ?? []) as { id: string; platform: string }[]) {
      const provider = adsProviderFor(account.platform as never);
      if (provider.capabilities.ads.support !== 'SUPPORTED') {
        skipped.push(provider.capabilities.label);
        continue;
      }
      const tokens = await readTokens(account.id);
      const remote = await provider.getAdAccounts(tokens.accessToken);

      for (const item of remote) {
        await db.from('ad_accounts').upsert({
          client_id: clientId,
          social_account_id: account.id,
          platform: account.platform,
          external_id: item.externalId,
          name: item.name,
          currency: item.currency,
          timezone: item.timezone ?? null,
          business_id: item.businessId ?? null,
          business_name: item.businessName ?? null,
          account_status: item.accountStatus,
          funding_source: item.fundingSource ?? null,
          spend_cap: item.spendCap ?? null,
          amount_spent: item.amountSpent ?? null,
          status: 'CONNECTED',
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'client_id,platform,external_id' });
        imported += 1;
      }
    }

    await enqueue({
      queue: 'billing', type: 'billing:sync',
      payload: { clientId }, clientId,
      idempotencyKey: `billing_sync_${clientId}_${new Date().toISOString().slice(0, 13)}`,
    });

    await logger.info({
      channel: 'ADMIN', action: 'ad_accounts.synced',
      message: `${imported} conta(s) publicitaria(s) sincronizada(s).`,
      clientId, userId: session.userId,
    });

    revalidatePath('/contas-publicitarias');
    return {
      ok: true,
      message: `${imported} conta(s) publicitaria(s) sincronizada(s).`,
      hint: skipped.length
        ? `Sem conector de anuncios no NojAds para: ${[...new Set(skipped)].join(', ')}.`
        : undefined,
    };
  } catch (err) {
    const error = normalizeError(err, 'sincronizacao de contas publicitarias');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}
