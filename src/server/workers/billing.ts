import 'server-only';
/**
 * Billing Worker.
 *
 * Processes gateway webhooks, reconciles transaction state, and refreshes each
 * ad account's billing snapshot. It never initiates a charge — charges only
 * ever start from an explicit human confirmation in the UI.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { billingProviderFor } from '@/server/providers/billing';
import { contextForAdAccount } from '@/server/services/tokens';
import { nextInvoiceNumber } from '@/server/services/billing';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { notify, type JobContext } from './context';
import type { AdAccount, PaymentTransaction } from '@/types/models';

/** Maps a Stripe event onto our transaction state machine. */
const STATUS_BY_EVENT: Record<string, PaymentTransaction['status']> = {
  'payment_intent.succeeded': 'SUCCEEDED',
  'payment_intent.payment_failed': 'FAILED',
  'payment_intent.canceled': 'CANCELLED',
  'payment_intent.processing': 'PROCESSING',
  'charge.refunded': 'REFUNDED',
};

export async function handleProcessBillingEvent(ctx: JobContext): Promise<Record<string, unknown>> {
  const db = createAdminSupabase();
  const eventId = ctx.payload.billingEventId as string;

  const { data: event } = await db
    .from('billing_events').select('*').eq('id', eventId).maybeSingle();
  if (!event) return { skipped: true, reason: 'evento nao encontrado' };
  if (event.processed_at) return { skipped: true, reason: 'evento ja processado' };
  if (!event.signature_valid) {
    await db.from('billing_events').update({
      processed_at: new Date().toISOString(),
      processing_error: { code: 'INVALID_SIGNATURE', message: 'Assinatura do webhook invalida.' },
    }).eq('id', eventId);
    return { skipped: true, reason: 'assinatura invalida' };
  }

  try {
    const payload = event.payload as Record<string, unknown>;
    const object = (payload.data as Record<string, unknown> | undefined)?.object as Record<string, unknown> | undefined;
    const externalId = String(object?.id ?? object?.payment_intent ?? '');
    const nextStatus = STATUS_BY_EVENT[event.event_type];

    if (!externalId || !nextStatus) {
      await db.from('billing_events')
        .update({ processed_at: new Date().toISOString() }).eq('id', eventId);
      return { skipped: true, reason: 'evento sem efeito no NojAds' };
    }

    const { data: txRow } = await db
      .from('payment_transactions').select('*')
      .eq('provider', event.provider).eq('external_id', externalId).maybeSingle();
    if (!txRow) {
      await db.from('billing_events').update({
        processed_at: new Date().toISOString(),
        processing_error: { code: 'TRANSACTION_NOT_FOUND', externalId },
      }).eq('id', eventId);
      return { skipped: true, reason: 'transacao local nao encontrada' };
    }

    const transaction = txRow as PaymentTransaction;

    // Terminal states never move again: a redelivered webhook is a no-op.
    if (['SUCCEEDED', 'REFUNDED', 'CANCELLED'].includes(transaction.status)) {
      await db.from('billing_events')
        .update({ processed_at: new Date().toISOString(), transaction_id: transaction.id })
        .eq('id', eventId);
      return { skipped: true, reason: 'transacao ja em estado terminal' };
    }

    const timestamps: Record<string, string> = {};
    if (nextStatus === 'SUCCEEDED') timestamps.succeeded_at = new Date().toISOString();
    if (nextStatus === 'FAILED') timestamps.failed_at = new Date().toISOString();

    await db.from('payment_transactions').update({
      status: nextStatus,
      external_status: event.event_type,
      ...timestamps,
    }).eq('id', transaction.id);

    if (nextStatus === 'SUCCEEDED') {
      await db.from('invoices').insert({
        number: await nextInvoiceNumber(),
        client_id: transaction.client_id,
        transaction_id: transaction.id,
        ad_spend_amount: transaction.ad_spend_amount,
        nojads_fee: transaction.nojads_fee,
        gateway_fee: transaction.gateway_fee,
        total_amount: transaction.total_amount,
        currency: transaction.currency,
        status: 'PAID',
        paid_at: new Date().toISOString(),
        line_items: [
          { description: 'Investimento publicitario', amount: transaction.ad_spend_amount },
          { description: 'Taxa NojAds', amount: transaction.nojads_fee },
          { description: 'Taxa do gateway', amount: transaction.gateway_fee },
        ],
        is_demo: transaction.is_demo,
      });

      // A campaign parked on payment can proceed now.
      if (transaction.campaign_id) {
        await db.from('ad_campaigns')
          .update({ status: 'DRAFT', approved_at: new Date().toISOString() })
          .eq('id', transaction.campaign_id).eq('status', 'PENDING_PAYMENT');
      }
    }

    await notify({
      clientId: transaction.client_id,
      type: nextStatus === 'SUCCEEDED' ? 'PAYMENT_SUCCEEDED' : `PAYMENT_${nextStatus}`,
      severity: nextStatus === 'SUCCEEDED' ? 'SUCCESS' : nextStatus === 'FAILED' ? 'ERROR' : 'INFO',
      title: nextStatus === 'SUCCEEDED'
        ? `Pagamento confirmado — ${transaction.reference}`
        : `Pagamento ${nextStatus.toLowerCase()} — ${transaction.reference}`,
      body: `${transaction.total_amount} ${transaction.currency}`,
      link: '/billing',
      data: { transactionId: transaction.id },
    });

    await db.from('billing_events').update({
      processed_at: new Date().toISOString(), transaction_id: transaction.id,
    }).eq('id', eventId);

    await logger.info({
      channel: 'BILLING', action: 'billing.event_processed',
      message: `${event.event_type} -> ${nextStatus}`,
      clientId: transaction.client_id, transactionId: transaction.id,
    });

    return { transactionId: transaction.id, status: nextStatus };
  } catch (err) {
    const appError = normalizeError(err, 'processamento de evento de faturacao');
    await db.from('billing_events')
      .update({ processing_error: appError.toJSON() }).eq('id', eventId);
    throw appError;
  }
}

/** Refreshes what each platform actually reports about its billing state. */
export async function handleSyncBilling(ctx: JobContext): Promise<Record<string, unknown>> {
  const db = createAdminSupabase();
  const clientId = ctx.clientId as string | undefined;

  let query = db.from('ad_accounts').select('*').eq('status', 'CONNECTED');
  if (clientId) query = query.eq('client_id', clientId);
  const { data } = await query.limit(100);

  const summary = { synced: 0, skipped: 0, errors: [] as string[] };

  for (const account of (data ?? []) as AdAccount[]) {
    const provider = billingProviderFor(account.platform);
    if (!provider.isConfigured()) { summary.skipped += 1; continue; }

    try {
      const providerCtx = await contextForAdAccount(account.id);
      const snapshot = await provider.getSnapshot(providerCtx, account.external_id);

      await db.from('billing_accounts').upsert({
        client_id: account.client_id,
        ad_account_id: account.id,
        platform: account.platform,
        provider: provider.name,
        external_id: snapshot.externalId,
        currency: snapshot.currency,
        funding_model: snapshot.fundingModel,
        balance: snapshot.balance ?? null,
        credit_limit: snapshot.creditLimit ?? null,
        next_bill_at: snapshot.nextBillAt ?? null,
        supported_operations: snapshot.supportedOperations,
        status: snapshot.status,
        status_reason: snapshot.reason ?? null,
        last_synced_at: new Date().toISOString(),
        raw: snapshot.raw,
        is_demo: account.is_demo,
      }, { onConflict: 'client_id,platform,external_id' });

      if (!snapshot.canSpend) {
        await notify({
          clientId: account.client_id,
          type: 'AD_ACCOUNT_BLOCKED',
          severity: 'ERROR',
          title: `Conta publicitaria bloqueada — ${account.name ?? account.external_id}`,
          body: snapshot.reason ?? 'A plataforma reporta que esta conta nao pode gastar.',
          link: '/contas-publicitarias',
        });
      }
      summary.synced += 1;
    } catch (err) {
      summary.errors.push(`${account.external_id}: ${normalizeError(err).message}`);
    }
  }

  return summary as unknown as Record<string, unknown>;
}
