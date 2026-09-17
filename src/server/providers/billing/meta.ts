import 'server-only';
/**
 * Meta billing, read side.
 *
 * What the Marketing API genuinely exposes: the account's currency, its
 * funding source, its spend cap, how much it has already spent, and whether
 * the account is in a state that can spend at all. That last one is what stops
 * NojAds from publishing a campaign onto a disabled or unsettled account.
 *
 * What it does not expose: adding a payment method, charging a card, topping
 * up a prepaid balance. Those happen in Meta's own billing UI, and the
 * capability registry says so to the operator's face.
 */
import { graph, metaConfig } from '@/server/providers/meta/client';
import type {
  BillingProvider, PlatformBillingSnapshot, ProviderContext,
} from '@/server/providers/types';
import { fromMinorUnits } from '@/server/providers/ads/meta';

const SPENDABLE = new Set([1, 201]);   // ACTIVE, ANY_ACTIVE

const STATUS_REASON: Record<number, string> = {
  2: 'A conta publicitaria esta desativada pela Meta.',
  3: 'A conta tem faturas por liquidar. Regularize o pagamento no Gestor de Anuncios.',
  7: 'A conta esta em revisao de risco pela Meta.',
  8: 'A conta esta em processo de liquidacao.',
  9: 'A conta esta em periodo de tolerancia por falha de pagamento.',
  100: 'A conta esta em processo de encerramento.',
  101: 'A conta esta encerrada.',
};

export class MetaBillingProvider implements BillingProvider {
  readonly platform = 'FACEBOOK' as const;
  readonly name = 'META';

  isConfigured() { return metaConfig().isConfigured; }
  missingConfiguration() { return metaConfig().missing; }

  async getSnapshot(ctx: ProviderContext, adAccountExternalId: string): Promise<PlatformBillingSnapshot> {
    const path = adAccountExternalId.startsWith('act_')
      ? adAccountExternalId : `act_${adAccountExternalId}`;

    const row = await graph<Record<string, unknown>>({
      path: `/${path}`,
      accessToken: ctx.accessToken,
      operation: 'leitura de faturacao da conta publicitaria',
      step: 'consulta na Meta',
      params: {
        fields: 'id,currency,account_status,disable_reason,balance,spend_cap,amount_spent,' +
                'funding_source_details,is_prepay_account,next_bill_date',
      },
    });

    const currency = String(row.currency ?? 'USD');
    const statusCode = Number(row.account_status ?? 0);
    const isPrepay = Boolean(row.is_prepay_account);

    return {
      externalId: String(row.id),
      currency,
      fundingModel: isPrepay ? 'PREPAID' : 'POSTPAID',
      balance: row.balance !== undefined ? fromMinorUnits(Number(row.balance), currency) : undefined,
      creditLimit: row.spend_cap ? fromMinorUnits(Number(row.spend_cap), currency) : undefined,
      nextBillAt: row.next_bill_date ? String(row.next_bill_date) : undefined,
      status: SPENDABLE.has(statusCode) ? 'ACTIVE' : `BLOCKED_${statusCode}`,
      canSpend: SPENDABLE.has(statusCode),
      reason: SPENDABLE.has(statusCode) ? undefined
        : STATUS_REASON[statusCode] ?? `A Meta reporta o estado ${statusCode} para esta conta.`,
      // Exactly what NojAds can do here — nothing more is claimed.
      supportedOperations: ['READ_BALANCE', 'READ_FUNDING_SOURCE', 'READ_SPEND'],
      raw: row,
    };
  }
}
