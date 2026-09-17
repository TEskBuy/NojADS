'use server';
/**
 * Billing mutations.
 *
 * A real charge requires: a signed-in staff user, the client's spend limits
 * satisfied, and the literal word CONFIRMAR typed by a person. Automation can
 * reach none of this.
 */
import { revalidatePath } from 'next/cache';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireClientAccess, requireAdmin } from '@/server/auth/session';
import { confirmPaymentSchema, fieldErrors, spendLimitsSchema } from '@/server/validators/schemas';
import {
  checkSpendLimits, computeBreakdown, createTransaction, loadFeeConfig,
} from '@/server/services/billing';
import { paymentProvider } from '@/server/providers/payment';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import type { ActionState } from './clients';

export async function updateSpendLimitsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const clientId = String(formData.get('client_id') ?? '');
    const { session } = await requireClientAccess(clientId, 'alteracao de limites de gasto', { write: true });

    const parsed = spendLimitsSchema.safeParse({
      client_id: clientId,
      currency: formData.get('currency') || 'USD',
      daily_limit: formData.get('daily_limit') || null,
      monthly_limit: formData.get('monthly_limit') || null,
      per_campaign_limit: formData.get('per_campaign_limit') || null,
      per_transaction_limit: formData.get('per_transaction_limit') || null,
      require_approval_above: formData.get('require_approval_above') || null,
      ai_max_budget_increase_pct: formData.get('ai_max_budget_increase_pct') || 0,
      block_automatic_payments: formData.get('block_automatic_payments') === 'on',
    });

    if (!parsed.success) {
      return { ok: false, message: 'Alguns campos precisam de correcao.', fields: fieldErrors(parsed.error) };
    }

    const db = createAdminSupabase();
    const { error } = await db.from('spend_limits')
      .upsert({ ...parsed.data, updated_by: session.userId }, { onConflict: 'client_id' });

    if (error) return { ok: false, message: `Nao foi possivel guardar: ${error.message}` };

    await logger.info({
      channel: 'BILLING', action: 'spend_limits.updated',
      clientId, userId: session.userId, metadata: { ...parsed.data },
    });

    revalidatePath('/billing');
    revalidatePath('/definicoes');
    return { ok: true, message: 'Limites de gasto atualizados. Passam a valer imediatamente.' };
  } catch (err) {
    const error = normalizeError(err, 'alteracao de limites de gasto');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

/**
 * Real charge through the configured gateway. Refuses loudly when no gateway is
 * configured rather than pretending a payment happened.
 */
export async function confirmPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const clientId = String(formData.get('client_id') ?? '');
    const { session } = await requireClientAccess(clientId, 'pagamento', { write: true });

    const parsed = confirmPaymentSchema.safeParse({
      client_id: clientId,
      campaign_id: formData.get('campaign_id') || null,
      amount: formData.get('amount'),
      currency: formData.get('currency'),
      payment_method_id: formData.get('payment_method_id') || null,
      purpose: formData.get('purpose') || 'AD_SPEND',
      confirmation: formData.get('confirmation'),
    });

    if (!parsed.success) {
      return { ok: false, message: 'Confirmacao invalida.', fields: fieldErrors(parsed.error) };
    }

    const provider = paymentProvider();
    if (!provider.isConfigured()) {
      return {
        ok: false,
        code: 'PAYMENT_GATEWAY_NOT_CONFIGURED',
        message: 'Nenhum gateway de pagamento esta configurado nesta instalacao.',
        hint:
          'Defina PAYMENT_GATEWAY e as chaves correspondentes. Nenhuma cobranca foi feita — ' +
          'o NojAds nao simula pagamentos.',
      };
    }

    const input = parsed.data;
    const fees = await loadFeeConfig();
    const breakdown = computeBreakdown(input.amount, input.currency, fees);

    await checkSpendLimits({
      clientId,
      amount: breakdown.total,
      currency: breakdown.currency,
      campaignId: input.campaign_id,
      operation: 'pagamento',
    });

    const db = createAdminSupabase();
    const { data: customer } = await db
      .from('payment_customers').select('external_id')
      .eq('client_id', clientId).eq('provider', provider.name).maybeSingle();

    const { data: method } = input.payment_method_id
      ? await db.from('payment_methods').select('external_id').eq('id', input.payment_method_id).maybeSingle()
      : { data: null };

    const { transaction, deduplicated } = await createTransaction({
      clientId,
      userId: session.userId,
      campaignId: input.campaign_id,
      provider: provider.name,
      paymentMethodId: input.payment_method_id,
      purpose: input.purpose,
      breakdown,
      confirmedByUserId: session.userId,
      metadata: { confirmedFrom: 'billing-ui' },
    });

    if (deduplicated && transaction.status !== 'PENDING') {
      return {
        ok: true,
        message: `Esta transacao ja existia (${transaction.reference}) com estado ${transaction.status}. Nada foi cobrado de novo.`,
      };
    }

    const result = await provider.charge({
      clientId,
      campaignId: input.campaign_id ?? undefined,
      amount: breakdown,
      paymentMethodExternalId: method?.external_id,
      customerExternalId: customer?.external_id,
      description: `NojAds ${input.purpose} — ${transaction.reference}`,
      idempotencyKey: transaction.idempotency_key,
      confirmedByUserId: session.userId,
    });

    await db.from('payment_transactions').update({
      external_id: result.externalId,
      status: result.status,
      authorized_at: new Date().toISOString(),
      ...(result.status === 'SUCCEEDED' ? { succeeded_at: new Date().toISOString() } : {}),
    }).eq('id', transaction.id);

    await logger.info({
      channel: 'BILLING', action: 'payment.submitted',
      message: `${breakdown.total} ${breakdown.currency} — ${result.status}`,
      clientId, userId: session.userId, transactionId: transaction.id,
    });

    revalidatePath('/billing');
    return {
      ok: true,
      message:
        result.status === 'SUCCEEDED'
          ? `Pagamento confirmado. Referencia ${transaction.reference}.`
          : `Pagamento submetido (${result.status}). Referencia ${transaction.reference}. ` +
            'O estado final chega pelo webhook do gateway — o NojAds so o marca como concluido quando o gateway confirmar.',
      hint: result.redirectUrl ? `E necessario concluir em: ${result.redirectUrl}` : undefined,
    };
  } catch (err) {
    const error = normalizeError(err, 'pagamento');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function updateFeeSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireAdmin('alteracao da taxa NojAds');
    const percent = Number(formData.get('nojads_fee_percent') ?? 0);

    if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
      return { ok: false, message: 'A taxa tem de estar entre 0 e 50 por cento.' };
    }

    const db = createAdminSupabase();
    await db.from('app_settings').upsert({
      key: 'nojads_fee_percent',
      value: percent,
      description: 'Taxa NojAds aplicada sobre o gasto publicitario, em percentagem.',
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });

    revalidatePath('/billing');
    return { ok: true, message: `Taxa NojAds definida em ${percent}%.` };
  } catch (err) {
    const error = normalizeError(err, 'alteracao da taxa NojAds');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}
