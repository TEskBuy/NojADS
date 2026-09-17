/**
 * Environment access.
 *
 * Nothing here throws at import time: a missing integration must surface in
 * the UI as "nao configurado", not as a crashed build. Server-only values are
 * read lazily through `serverEnv()` so they can never be bundled into the
 * client.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function bool(name: string, fallback = false): boolean {
  const raw = read(name);
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function int(name: string, fallback: number): number {
  const raw = read(name);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Values safe to reach the browser. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'NojAds',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;

export type ServerEnv = ReturnType<typeof serverEnv>;

/** Server-only values. Calling this in a client component is a build error. */
export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() nao pode ser usado no browser.');
  }
  return {
    nodeEnv: read('NODE_ENV') ?? 'development',
    appUrl: publicEnv.appUrl,

    supabaseUrl: read('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: read('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),

    tokenEncryptionKey: read('TOKEN_ENCRYPTION_KEY'),
    tokenEncryptionKeyVersion: int('TOKEN_ENCRYPTION_KEY_VERSION', 1),

    cronSecret: read('CRON_SECRET'),
    workerSharedSecret: read('WORKER_SHARED_SECRET'),

    workerId: read('WORKER_ID') ?? `worker-${process.pid}`,
    workerQueues: (read('WORKER_QUEUES') ?? 'content,publishing,analytics,ads,billing,notifications')
      .split(',').map((q) => q.trim()).filter(Boolean),
    workerConcurrency: int('WORKER_CONCURRENCY', 3),
    workerPollIntervalMs: int('WORKER_POLL_INTERVAL_MS', 5000),
    schedulerIntervalMs: int('SCHEDULER_INTERVAL_MS', 60000),

    aiProvider: (read('AI_PROVIDER') ?? 'none') as 'anthropic' | 'openai' | 'none',
    anthropicApiKey: read('ANTHROPIC_API_KEY'),
    anthropicModel: read('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-5',
    openaiApiKey: read('OPENAI_API_KEY'),
    openaiModel: read('OPENAI_MODEL') ?? 'gpt-4o',

    metaAppId: read('META_APP_ID'),
    metaAppSecret: read('META_APP_SECRET'),
    metaApiVersion: read('META_API_VERSION') ?? 'v21.0',
    metaRedirectUri: read('META_REDIRECT_URI'),
    metaWebhookVerifyToken: read('META_WEBHOOK_VERIFY_TOKEN'),
    metaScopes: (read('META_SCOPES') ?? '').split(',').map((s) => s.trim()).filter(Boolean),

    tiktokClientKey: read('TIKTOK_CLIENT_KEY'),
    tiktokClientSecret: read('TIKTOK_CLIENT_SECRET'),
    tiktokRedirectUri: read('TIKTOK_REDIRECT_URI'),

    googleClientId: read('GOOGLE_CLIENT_ID'),
    googleClientSecret: read('GOOGLE_CLIENT_SECRET'),
    googleRedirectUri: read('GOOGLE_REDIRECT_URI'),
    googleAdsDeveloperToken: read('GOOGLE_ADS_DEVELOPER_TOKEN'),
    googleAdsLoginCustomerId: read('GOOGLE_ADS_LOGIN_CUSTOMER_ID'),

    linkedinClientId: read('LINKEDIN_CLIENT_ID'),
    linkedinClientSecret: read('LINKEDIN_CLIENT_SECRET'),
    linkedinRedirectUri: read('LINKEDIN_REDIRECT_URI'),

    xClientId: read('X_CLIENT_ID'),
    xClientSecret: read('X_CLIENT_SECRET'),
    xRedirectUri: read('X_REDIRECT_URI'),

    paymentGateway: (read('PAYMENT_GATEWAY') ?? 'none') as 'stripe' | 'none',
    stripeSecretKey: read('STRIPE_SECRET_KEY'),
    stripePublishableKey: read('STRIPE_PUBLISHABLE_KEY'),
    stripeWebhookSecret: read('STRIPE_WEBHOOK_SECRET'),

    fxProvider: (read('FX_PROVIDER') ?? 'none') as 'none' | 'manual',
    fxManualRates: read('FX_MANUAL_RATES'),

    billingRequireExplicitConfirmation: bool('BILLING_REQUIRE_EXPLICIT_CONFIRMATION', true),
    billingMaxSingleTransaction: read('BILLING_MAX_SINGLE_TRANSACTION')
      ? Number(read('BILLING_MAX_SINGLE_TRANSACTION')) : undefined,
    billingDefaultCurrency: read('BILLING_DEFAULT_CURRENCY') ?? 'USD',
  };
}

/** Throws with a message naming the exact variable. Used at the edge of I/O. */
export function requireEnv<K extends keyof ServerEnv>(key: K, varName: string): NonNullable<ServerEnv[K]> {
  const value = serverEnv()[key];
  if (value === undefined || value === null || value === '') {
    throw new Error(
      `Variavel de ambiente ausente: ${varName}. ` +
      `Configure-a em .env.local (local) ou nas Environment Variables da Vercel (producao).`,
    );
  }
  return value as NonNullable<ServerEnv[K]>;
}
