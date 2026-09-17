import 'server-only';
/**
 * Financial safety (requisitos 26, 37, 39, 40, 65, 76).
 *
 * Rules enforced here, not in the interface:
 *   - ad spend, NojAds fee and gateway fee are computed and stored separately;
 *   - every spend limit is checked before a charge, never after;
 *   - a real charge needs a user id from an explicit confirmation click;
 *   - the AI can propose a budget change but cannot raise real spend beyond the
 *     client's configured ceiling;
 *   - transactions carry a deterministic idempotency key, so a retry cannot
 *     bill twice.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { idempotencyKey } from '@/lib/crypto';
import { AppError, SpendLimitError, ValidationError } from '@/lib/errors';
import type { MoneyBreakdown } from '@/server/providers/types';
import type { SpendLimits } from '@/types/models';

export interface FeeConfig {
  nojadsFeePercent: number;
  gatewayFeePercent: number;
  gatewayFeeFixed: number;
}

export async function loadFeeConfig(): Promise<FeeConfig> {
  const db = createAdminSupabase();
  const { data } = await db
    .from('app_settings').select('value').eq('key', 'nojads_fee_percent').maybeSingle();
  const nojadsFeePercent = Number(data?.value ?? 0);
  return {
    nojadsFeePercent: Number.isFinite(nojadsFeePercent) ? nojadsFeePercent : 0,
    // Stripe's standard card rate; adjust per contract.
    gatewayFeePercent: 2.9,
    gatewayFeeFixed: 0.3,
  };
}

/** Rounds to 4 decimals, matching the numeric(18,4) columns. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Splits an ad-spend amount into its three parts. The invariant
 * total = adSpend + nojadsFee + gatewayFee is also a CHECK constraint on
 * payment_transactions, so a bug here fails loudly at insert time.
 */
export function computeBreakdown(
  adSpend: number, currency: string, fees: FeeConfig,
): MoneyBreakdown {
  const nojadsFee = round(adSpend * (fees.nojadsFeePercent / 100));
  const subtotal = adSpend + nojadsFee;
  const gatewayFee = round(subtotal * (fees.gatewayFeePercent / 100) + fees.gatewayFeeFixed);
  return {
    adSpend: round(adSpend),
    nojadsFee,
    gatewayFee,
    total: round(subtotal + gatewayFee),
    currency: currency.toUpperCase(),
  };
}

export async function loadSpendLimits(clientId: string): Promise<SpendLimits | null> {
  const db = createAdminSupabase();
  const { data } = await db
    .from('spend_limits').select('*').eq('client_id', clientId).maybeSingle();
  return (data as SpendLimits) ?? null;
}

export interface LimitCheck {
  allowed: boolean;
  requiresApproval: boolean;
  reasons: string[];
}

/** Every configured ceiling, checked before any money moves. */
export async function checkSpendLimits(args: {
  clientId: string;
  amount: number;
  currency: string;
  campaignId?: string | null;
  operation: string;
}): Promise<LimitCheck> {
  const db = createAdminSupabase();
  const limits = await loadSpendLimits(args.clientId);
  const env = serverEnv();
  const check: LimitCheck = { allowed: true, requiresApproval: false, reasons: [] };

  if (env.billingMaxSingleTransaction && args.amount > env.billingMaxSingleTransaction) {
    throw new SpendLimitError({
      operation: args.operation,
      limitName: 'BILLING_MAX_SINGLE_TRANSACTION',
      limit: env.billingMaxSingleTransaction,
      requested: args.amount,
      currency: args.currency,
    });
  }

  if (!limits) {
    check.reasons.push('Nenhum limite de gasto definido para este cliente. Recomenda-se definir em Definicoes > Limites de gasto.');
    return check;
  }

  if (limits.per_transaction_limit && args.amount > Number(limits.per_transaction_limit)) {
    throw new SpendLimitError({
      operation: args.operation, limitName: 'Limite por transacao',
      limit: Number(limits.per_transaction_limit), requested: args.amount, currency: args.currency,
    });
  }

  if (limits.per_campaign_limit && args.campaignId) {
    const { data: spent } = await db
      .from('payment_transactions')
      .select('total_amount')
      .eq('campaign_id', args.campaignId)
      .in('status', ['SUCCEEDED', 'PROCESSING', 'PENDING']);
    const already = (spent ?? []).reduce((sum, row: { total_amount: number }) => sum + Number(row.total_amount), 0);
    if (already + args.amount > Number(limits.per_campaign_limit)) {
      throw new SpendLimitError({
        operation: args.operation, limitName: 'Limite por campanha',
        limit: Number(limits.per_campaign_limit), requested: already + args.amount, currency: args.currency,
      });
    }
  }

  if (limits.daily_limit) {
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const { data: today } = await db
      .from('payment_transactions').select('total_amount')
      .eq('client_id', args.clientId)
      .gte('created_at', since.toISOString())
      .in('status', ['SUCCEEDED', 'PROCESSING', 'PENDING']);
    const already = (today ?? []).reduce((sum, row: { total_amount: number }) => sum + Number(row.total_amount), 0);
    if (already + args.amount > Number(limits.daily_limit)) {
      throw new SpendLimitError({
        operation: args.operation, limitName: 'Limite diario',
        limit: Number(limits.daily_limit), requested: already + args.amount, currency: args.currency,
      });
    }
  }

  if (limits.monthly_limit) {
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
    const { data: month } = await db
      .from('payment_transactions').select('total_amount')
      .eq('client_id', args.clientId)
      .gte('created_at', since.toISOString())
      .in('status', ['SUCCEEDED', 'PROCESSING', 'PENDING']);
    const already = (month ?? []).reduce((sum, row: { total_amount: number }) => sum + Number(row.total_amount), 0);
    if (already + args.amount > Number(limits.monthly_limit)) {
      throw new SpendLimitError({
        operation: args.operation, limitName: 'Limite mensal',
        limit: Number(limits.monthly_limit), requested: already + args.amount, currency: args.currency,
      });
    }
  }

  if (limits.require_approval_above && args.amount > Number(limits.require_approval_above)) {
    check.requiresApproval = true;
    check.reasons.push(
      `O valor excede ${limits.require_approval_above} ${limits.currency} e exige aprovacao explicita.`,
    );
  }

  return check;
}

/**
 * The AI's ceiling on budget changes. Default is 0%: automation proposes,
 * a person decides (requisito 65).
 */
export async function assertAIBudgetChangeAllowed(args: {
  clientId: string;
  currentBudget: number;
  proposedBudget: number;
}): Promise<{ allowed: boolean; reason: string }> {
  const limits = await loadSpendLimits(args.clientId);
  const maxPct = Number(limits?.ai_max_budget_increase_pct ?? 0);

  if (args.proposedBudget <= args.currentBudget) {
    return { allowed: true, reason: 'Reducao de orcamento nao exige autorizacao adicional.' };
  }
  if (maxPct <= 0) {
    return {
      allowed: false,
      reason: 'A automacao nao esta autorizada a aumentar orcamentos neste cliente. ' +
              'A alteracao foi registada como proposta e aguarda aprovacao.',
    };
  }

  const increasePct = ((args.proposedBudget - args.currentBudget) / args.currentBudget) * 100;
  if (increasePct > maxPct) {
    return {
      allowed: false,
      reason: `O aumento proposto (${increasePct.toFixed(1)}%) excede o maximo autorizado para automacao (${maxPct}%).`,
    };
  }
  return { allowed: true, reason: `Aumento de ${increasePct.toFixed(1)}% dentro do limite de ${maxPct}%.` };
}

export interface CreateTransactionArgs {
  clientId: string;
  userId: string;
  platform?: string | null;
  adAccountId?: string | null;
  campaignId?: string | null;
  billingAccountId?: string | null;
  provider: string;
  paymentMethodId?: string | null;
  purpose: 'AD_SPEND' | 'TOP_UP' | 'SUBSCRIPTION' | 'FEE';
  breakdown: MoneyBreakdown;
  /** Must come from a real confirmation click, never from automation. */
  confirmedByUserId: string;
  metadata?: Record<string, unknown>;
  isDemo?: boolean;
}

/** Creates a PENDING transaction. Deterministic key => a retry returns the same row. */
export async function createTransaction(args: CreateTransactionArgs) {
  const db = createAdminSupabase();

  if (!args.confirmedByUserId) {
    throw new AppError({
      code: 'PAYMENT_CONFIRMATION_MISSING',
      operation: 'registo de transacao',
      step: 'verificacao de confirmacao humana',
      message: 'Nenhuma pessoa confirmou este pagamento.',
      hint: 'Pagamentos reais exigem confirmacao explicita no ecra de revisao.',
      status: 403,
    });
  }
  if (args.breakdown.total <= 0) {
    throw new ValidationError({
      operation: 'registo de transacao',
      message: 'O valor total tem de ser maior que zero.',
    });
  }

  const key = idempotencyKey(
    'tx', args.clientId, args.campaignId ?? 'none', args.purpose,
    args.breakdown.total.toFixed(4), args.breakdown.currency,
  );

  const { data: existing } = await db
    .from('payment_transactions').select('*').eq('idempotency_key', key).maybeSingle();
  if (existing) return { transaction: existing, deduplicated: true };

  const { data, error } = await db.from('payment_transactions').insert({
    client_id: args.clientId,
    user_id: args.userId,
    platform: args.platform ?? null,
    ad_account_id: args.adAccountId ?? null,
    campaign_id: args.campaignId ?? null,
    billing_account_id: args.billingAccountId ?? null,
    provider: args.provider,
    payment_method_id: args.paymentMethodId ?? null,
    purpose: args.purpose,
    ad_spend_amount: args.breakdown.adSpend,
    nojads_fee: args.breakdown.nojadsFee,
    gateway_fee: args.breakdown.gatewayFee,
    total_amount: args.breakdown.total,
    currency: args.breakdown.currency,
    status: 'PENDING',
    idempotency_key: key,
    confirmed_by: args.confirmedByUserId,
    confirmed_at: new Date().toISOString(),
    metadata: args.metadata ?? {},
    is_demo: args.isDemo ?? false,
  }).select().single();

  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await db
        .from('payment_transactions').select('*').eq('idempotency_key', key).single();
      return { transaction: raced, deduplicated: true };
    }
    throw new AppError({
      code: 'TRANSACTION_CREATE_FAILED',
      operation: 'registo de transacao',
      step: 'insercao na base de dados',
      message: error.message,
      status: 500,
    });
  }

  return { transaction: data, deduplicated: false };
}

/** Sequential invoice number: NOJ-YYYY-000001. */
export async function nextInvoiceNumber(): Promise<string> {
  const db = createAdminSupabase();
  const year = new Date().getFullYear();
  const { count } = await db
    .from('invoices').select('id', { count: 'exact', head: true })
    .gte('issued_at', `${year}-01-01T00:00:00Z`);
  return `NOJ-${year}-${String((count ?? 0) + 1).padStart(6, '0')}`;
}

/**
 * Currency conversion. With FX_PROVIDER=none this refuses rather than
 * inventing a rate — the brief is explicit that AOA must not be silently
 * assumed to work on a platform that does not accept it (requisito 42).
 */
export function convertCurrency(args: {
  amount: number; from: string; to: string;
}): { amount: number; rate: number; source: string } {
  const env = serverEnv();
  if (args.from.toUpperCase() === args.to.toUpperCase()) {
    return { amount: args.amount, rate: 1, source: 'identity' };
  }
  if (env.fxProvider === 'manual' && env.fxManualRates) {
    const rates = JSON.parse(env.fxManualRates) as Record<string, number>;
    const rate = rates[`${args.from.toUpperCase()}_${args.to.toUpperCase()}`];
    if (rate) {
      return { amount: Math.round(args.amount * rate * 10_000) / 10_000, rate, source: 'FX_MANUAL_RATES' };
    }
  }
  throw new AppError({
    code: 'FX_NOT_AVAILABLE',
    operation: 'conversao de moeda',
    step: 'obtencao da taxa de cambio',
    message: `Nao existe taxa de cambio configurada de ${args.from} para ${args.to}.`,
    hint:
      'A conta publicitaria opera noutra moeda. Configure FX_PROVIDER e FX_MANUAL_RATES, ' +
      'ou introduza o orcamento diretamente na moeda da conta. O NojAds nao inventa taxas de cambio.',
    status: 409,
  });
}
