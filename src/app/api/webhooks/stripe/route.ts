/**
 * Stripe webhooks.
 *
 * The signature is verified before the event is stored, and the event is only
 * ever queued once — the unique key on (provider, external_event_id) plus the
 * terminal-state check in the billing worker make a redelivery a no-op.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { paymentProvider } from '@/server/providers/payment';
import { enqueue } from '@/server/queue/queue';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  const provider = paymentProvider();
  const verification = provider.verifyWebhook({ rawBody, signature });

  if (!verification.valid || !verification.eventId) {
    await logger.warn({
      channel: 'WEBHOOK', action: 'stripe.invalid_signature',
      message: 'Webhook Stripe rejeitado: assinatura invalida ou gateway nao configurado.',
    });
    return NextResponse.json({ error: 'Assinatura invalida.' }, { status: 400 });
  }

  const db = createAdminSupabase();
  const { data: stored } = await db.from('billing_events').upsert({
    provider: 'stripe',
    external_event_id: verification.eventId,
    event_type: verification.eventType ?? 'unknown',
    signature_valid: true,
    payload: verification.payload as Record<string, unknown>,
  }, { onConflict: 'provider,external_event_id', ignoreDuplicates: true })
    .select('id, processed_at').maybeSingle();

  if (stored && !stored.processed_at) {
    await enqueue({
      queue: 'billing',
      type: 'billing:process_event',
      payload: { billingEventId: stored.id },
      idempotencyKey: `billing_event_${verification.eventId}`,
      priority: 20,
    });
  }

  return NextResponse.json({ received: true });
}
