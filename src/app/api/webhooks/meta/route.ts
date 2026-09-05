/**
 * Meta webhooks.
 *
 * GET performs the subscription handshake. POST verifies the X-Hub-Signature-256
 * HMAC before storing anything — an unsigned callback is recorded as invalid and
 * never acted on (requisito 75).
 */
import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { safeCompare } from '@/lib/crypto';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const env = serverEnv();
  const params = request.nextUrl.searchParams;

  if (
    params.get('hub.mode') === 'subscribe' &&
    env.metaWebhookVerifyToken &&
    params.get('hub.verify_token') === env.metaWebhookVerifyToken
  ) {
    return new NextResponse(params.get('hub.challenge') ?? '', { status: 200 });
  }
  return new NextResponse('Verificacao recusada.', { status: 403 });
}

export async function POST(request: NextRequest) {
  const env = serverEnv();
  const rawBody = await request.text();
  const signature = request.headers.get('x-hub-signature-256') ?? '';

  let valid = false;
  if (env.metaAppSecret && signature.startsWith('sha256=')) {
    const expected = crypto.createHmac('sha256', env.metaAppSecret).update(rawBody).digest('hex');
    valid = safeCompare(expected, signature.slice(7));
  }

  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(rawBody); } catch { payload = { raw: rawBody.slice(0, 2000) }; }

  const db = createAdminSupabase();
  const eventId = `${payload.object ?? 'meta'}_${crypto.createHash('sha256').update(rawBody).digest('hex').slice(0, 24)}`;

  // Unique on (source, external_event_id): a redelivery is stored once.
  await db.from('webhook_events').upsert({
    source: 'META',
    external_event_id: eventId,
    topic: String(payload.object ?? 'unknown'),
    signature_valid: valid,
    headers: { 'x-hub-signature-256': signature ? 'present' : 'absent' },
    payload,
  }, { onConflict: 'source,external_event_id', ignoreDuplicates: true });

  if (!valid) {
    await logger.warn({
      channel: 'WEBHOOK', action: 'meta.invalid_signature',
      message: 'Webhook da Meta recebido com assinatura invalida. Registado e ignorado.',
    });
  }

  // Meta expects 200 quickly; processing happens off the request path.
  return NextResponse.json({ received: true });
}
