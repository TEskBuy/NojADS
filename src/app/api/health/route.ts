/** Liveness probe. Reports what is configured without leaking any secret. */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { queueStats } from '@/server/queue/queue';
import { ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const env = serverEnv();
    const db = createAdminSupabase();
    const started = Date.now();
    const { error } = await db.from('app_settings').select('key').limit(1);

    return ok({
      status: error ? 'degraded' : 'ok',
      database: { reachable: !error, latencyMs: Date.now() - started, error: error?.message },
      queues: await queueStats(),
      configured: {
        supabase: Boolean(env.supabaseUrl && env.supabaseServiceRoleKey),
        tokenVault: Boolean(env.tokenEncryptionKey),
        meta: Boolean(env.metaAppId && env.metaAppSecret),
        ai: env.aiProvider !== 'none',
        paymentGateway: env.paymentGateway !== 'none',
        cronSecret: Boolean(env.cronSecret),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return fail(err, 'verificacao de saude');
  }
}
