import 'server-only';
/**
 * PaymentProvider.
 *
 * This is the gateway side of money — NojAds fees, prepaid top-ups, anything
 * NojAds itself charges. It is deliberately separate from BillingProvider,
 * which only reads what an ad platform exposes.
 *
 * Card data never touches this server: the gateway tokenises, and NojAds keeps
 * only the token plus the last four digits (requisito 38).
 */
import { serverEnv } from '@/lib/env';
import { NotConfiguredError, AppError } from '@/lib/errors';
import { safeCompare } from '@/lib/crypto';
import crypto from 'node:crypto';
import type { ChargeRequest, ChargeResult, PaymentProvider } from '@/server/providers/types';

class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';

  isConfigured() { return Boolean(serverEnv().stripeSecretKey); }
  missingConfiguration() {
    const env = serverEnv();
    const missing: string[] = [];
    if (!env.stripeSecretKey) missing.push('STRIPE_SECRET_KEY');
    if (!env.stripeWebhookSecret) missing.push('STRIPE_WEBHOOK_SECRET');
    return missing;
  }

  private key(): string {
    const key = serverEnv().stripeSecretKey;
    if (!key) {
      throw new NotConfiguredError({
        operation: 'pagamento', provider: 'Stripe',
        missing: this.missingConfiguration(), docsPath: 'docs/billing.md',
      });
    }
    return key;
  }

  private async call<T>(path: string, body: Record<string, string>, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.key()}`,
      'content-type': 'application/x-www-form-urlencoded',
    };
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method: 'POST',
      headers,
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(45_000),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new AppError({
        code: `STRIPE_${payload?.error?.code ?? response.status}`,
        operation: 'pagamento',
        step: `chamada a Stripe (${path})`,
        message: payload?.error?.message ?? `HTTP ${response.status}`,
        hint: payload?.error?.type === 'card_error'
          ? 'O cartao foi recusado. Peca ao cliente outro metodo de pagamento.'
          : 'Verifique as credenciais Stripe e os dados enviados.',
        status: response.status,
        retryable: response.status >= 500,
      });
    }
    return payload as T;
  }

  async createCustomer(args: { clientId: string; email?: string; name?: string }) {
    const created = await this.call<{ id: string }>('customers', {
      ...(args.email ? { email: args.email } : {}),
      ...(args.name ? { name: args.name } : {}),
      'metadata[nojads_client_id]': args.clientId,
    }, `customer_${args.clientId}`);
    return { externalId: created.id };
  }

  async listPaymentMethods(customerExternalId: string) {
    const response = await fetch(
      `https://api.stripe.com/v1/payment_methods?customer=${customerExternalId}&type=card`,
      { headers: { authorization: `Bearer ${this.key()}` }, signal: AbortSignal.timeout(30_000) },
    );
    const payload = await response.json();
    if (!response.ok) return [];
    return (payload.data ?? []).map((pm: { id: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } }) => ({
      externalId: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
    }));
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    if (!request.confirmedByUserId) {
      throw new AppError({
        code: 'PAYMENT_NOT_CONFIRMED',
        operation: 'pagamento',
        step: 'verificacao de confirmacao explicita',
        message: 'Nenhum utilizador confirmou este pagamento.',
        hint: 'Um pagamento real exige sempre confirmacao explicita de uma pessoa.',
        status: 403,
      });
    }

    const zeroDecimal = ['JPY', 'KRW', 'VND', 'CLP'].includes(request.amount.currency.toUpperCase());
    const minor = zeroDecimal
      ? Math.round(request.amount.total)
      : Math.round(request.amount.total * 100);

    const intent = await this.call<{ id: string; status: string; next_action?: { redirect_to_url?: { url?: string } } }>(
      'payment_intents',
      {
        amount: String(minor),
        currency: request.amount.currency.toLowerCase(),
        description: request.description,
        confirm: 'true',
        ...(request.customerExternalId ? { customer: request.customerExternalId } : {}),
        ...(request.paymentMethodExternalId ? { payment_method: request.paymentMethodExternalId } : {}),
        'metadata[nojads_client_id]': request.clientId,
        'metadata[nojads_campaign_id]': request.campaignId ?? '',
        'metadata[ad_spend]': String(request.amount.adSpend),
        'metadata[nojads_fee]': String(request.amount.nojadsFee),
        'metadata[confirmed_by]': request.confirmedByUserId,
      },
      request.idempotencyKey,
    );

    const status = intent.status === 'succeeded' ? 'SUCCEEDED'
      : intent.status === 'processing' ? 'PROCESSING'
      : intent.status === 'canceled' ? 'FAILED' : 'PENDING';

    return {
      externalId: intent.id,
      status,
      redirectUrl: intent.next_action?.redirect_to_url?.url,
      raw: intent as unknown as Record<string, unknown>,
    };
  }

  async refund(args: { transactionExternalId: string; amount: number; currency: string; idempotencyKey: string }): Promise<ChargeResult> {
    const zeroDecimal = ['JPY', 'KRW', 'VND', 'CLP'].includes(args.currency.toUpperCase());
    const refund = await this.call<{ id: string; status: string }>('refunds', {
      payment_intent: args.transactionExternalId,
      amount: String(zeroDecimal ? Math.round(args.amount) : Math.round(args.amount * 100)),
    }, args.idempotencyKey);
    return {
      externalId: refund.id,
      status: refund.status === 'succeeded' ? 'SUCCEEDED' : 'PROCESSING',
      raw: refund as unknown as Record<string, unknown>,
    };
  }

  verifyWebhook(args: { rawBody: string; signature: string }) {
    const secret = serverEnv().stripeWebhookSecret;
    if (!secret) return { valid: false };

    const parts = Object.fromEntries(
      args.signature.split(',').map((kv) => kv.split('=') as [string, string]),
    );
    const timestamp = parts.t;
    const provided = parts.v1;
    if (!timestamp || !provided) return { valid: false };

    // Reject anything older than 5 minutes: blocks replayed callbacks.
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return { valid: false };

    const expected = crypto.createHmac('sha256', secret)
      .update(`${timestamp}.${args.rawBody}`).digest('hex');
    if (!safeCompare(expected, provided)) return { valid: false };

    const payload = JSON.parse(args.rawBody);
    return { valid: true, eventId: payload.id, eventType: payload.type, payload };
  }
}

class DisabledPaymentProvider implements PaymentProvider {
  readonly name = 'none';
  isConfigured() { return false; }
  missingConfiguration() { return ['PAYMENT_GATEWAY', 'STRIPE_SECRET_KEY']; }

  private fail(operation: string): never {
    throw new NotConfiguredError({
      operation, provider: 'Gateway de pagamento',
      missing: this.missingConfiguration(), docsPath: 'docs/billing.md',
    });
  }

  createCustomer(): Promise<{ externalId: string }> { this.fail('criacao de cliente de pagamento'); }
  listPaymentMethods(): Promise<never[]> { this.fail('listagem de metodos de pagamento'); }
  charge(): Promise<ChargeResult> { this.fail('cobranca'); }
  refund(): Promise<ChargeResult> { this.fail('reembolso'); }
  verifyWebhook() { return { valid: false }; }
}

export function paymentProvider(): PaymentProvider {
  return serverEnv().paymentGateway === 'stripe'
    ? new StripePaymentProvider()
    : new DisabledPaymentProvider();
}

export { StripePaymentProvider, DisabledPaymentProvider };
