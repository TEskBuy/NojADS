import 'server-only';
/**
 * Meta Graph API HTTP client.
 *
 * Handles appsecret_proof, retries on the errors Meta marks as transient, and
 * turns every Graph error into a ProviderError carrying Meta's own code and
 * message. No call here ever pretends to have succeeded.
 */
import crypto from 'node:crypto';
import { serverEnv } from '@/lib/env';
import { NotConfiguredError, ProviderError } from '@/lib/errors';

export interface MetaError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

/** Meta codes worth retrying: rate limits and transient platform faults. */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

/** Meta codes that mean "the token or permission is the problem". */
const AUTH_CODES = new Set([102, 190, 200, 210, 803]);

export function metaConfig() {
  const env = serverEnv();
  const missing: string[] = [];
  if (!env.metaAppId) missing.push('META_APP_ID');
  if (!env.metaAppSecret) missing.push('META_APP_SECRET');
  return {
    appId: env.metaAppId,
    appSecret: env.metaAppSecret,
    apiVersion: env.metaApiVersion,
    redirectUri: env.metaRedirectUri,
    scopes: env.metaScopes,
    missing,
    isConfigured: missing.length === 0,
  };
}

export function requireMetaConfig(operation: string) {
  const config = metaConfig();
  if (!config.isConfigured) {
    throw new NotConfiguredError({
      operation, provider: 'Meta', missing: config.missing, docsPath: 'docs/oauth.md',
    });
  }
  return config as Required<Pick<typeof config, 'appId' | 'appSecret'>> & typeof config;
}

/** Meta requires this proof alongside every server-side call. */
function appSecretProof(accessToken: string, appSecret: string): string {
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

export interface GraphRequest {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  accessToken: string;
  params?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown>;
  operation: string;
  step: string;
  /** Meta requires this on writes; it de-duplicates a retried create. */
  idempotencyKey?: string;
  maxRetries?: number;
}

function humanHint(code: number, subcode?: number): string {
  if (AUTH_CODES.has(code)) {
    return 'O token expirou ou a permissao foi revogada. Reconecte a conta em Redes Sociais.';
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return 'A Meta esta a limitar o numero de pedidos desta app. O NojAds vai tentar novamente automaticamente.';
  }
  if (code === 100) {
    return 'Um dos parametros enviados foi recusado. Verifique os campos do formulario e as permissoes da conta publicitaria.';
  }
  if (code === 200 && subcode === 1870034) {
    return 'A conta publicitaria nao tem permissao para criar campanhas. Verifique o acesso no Business Manager.';
  }
  if (code === 272) {
    return 'A conta publicitaria nao esta associada ao Business Manager desta app.';
  }
  if (code === 2635) {
    return 'Esta versao da API ja nao aceita esta operacao. Atualize META_API_VERSION.';
  }
  return 'Verifique as permissoes da conta conectada e os dados enviados.';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function graph<T = unknown>(request: GraphRequest): Promise<T> {
  const config = requireMetaConfig(request.operation);
  const maxRetries = request.maxRetries ?? 3;
  const base = `https://graph.facebook.com/${config.apiVersion}`;
  const path = request.path.startsWith('/') ? request.path : `/${request.path}`;

  let lastError: ProviderError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const url = new URL(`${base}${path}`);
    url.searchParams.set('access_token', request.accessToken);
    url.searchParams.set('appsecret_proof', appSecretProof(request.accessToken, config.appSecret!));
    for (const [key, value] of Object.entries(request.params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (request.idempotencyKey) {
      // Meta's own de-duplication for create calls.
      headers['X-Business-Idempotency-Key'] = request.idempotencyKey;
    }

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: request.method ?? 'GET',
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        cache: 'no-store',
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      lastError = new ProviderError({
        operation: request.operation,
        step: request.step,
        provider: 'Meta',
        platformCode: 'NETWORK',
        platformMessage: (err as Error).message,
        hint: 'Falha de rede ao contactar a Meta. O NojAds vai tentar novamente.',
        retryable: true,
      });
      if (attempt < maxRetries) { await sleep(500 * 2 ** attempt); continue; }
      throw lastError;
    }

    const text = await response.text();
    let payload: unknown;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }

    if (response.ok) return payload as T;

    const metaError = (payload as { error?: MetaError }).error;
    const code = metaError?.code ?? response.status;
    const retryable = RETRYABLE_CODES.has(code) || response.status >= 500 || response.status === 429;

    lastError = new ProviderError({
      operation: request.operation,
      step: request.step,
      provider: 'Meta',
      platformCode: code,
      platformMessage: metaError?.error_user_msg ?? metaError?.message ?? `HTTP ${response.status}`,
      hint: humanHint(code, metaError?.error_subcode),
      status: response.status,
      retryable,
      details: {
        type: metaError?.type,
        subcode: metaError?.error_subcode,
        fbtrace_id: metaError?.fbtrace_id,
        userTitle: metaError?.error_user_title,
      },
    });

    if (retryable && attempt < maxRetries) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    throw lastError;
  }

  throw lastError ?? new ProviderError({
    operation: request.operation, step: request.step, provider: 'Meta',
    platformMessage: 'Falha desconhecida.',
  });
}

/** Paginates a Graph edge, stopping at `maxPages` so a huge account can't hang a worker. */
export async function graphPaged<T>(
  request: GraphRequest & { maxPages?: number },
): Promise<T[]> {
  const maxPages = request.maxPages ?? 10;
  const results: T[] = [];
  let next: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response: { data?: T[]; paging?: { next?: string } } = next
      ? await fetchAbsolute(next, request)
      : await graph({ ...request, params: { ...request.params, limit: request.params?.limit ?? 100 } });

    results.push(...(response.data ?? []));
    next = response.paging?.next;
    if (!next) break;
  }
  return results;
}

async function fetchAbsolute<T>(url: string, request: GraphRequest): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(45_000) });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const metaError = (payload as { error?: MetaError }).error;
    throw new ProviderError({
      operation: request.operation,
      step: `${request.step} (paginacao)`,
      provider: 'Meta',
      platformCode: metaError?.code ?? response.status,
      platformMessage: metaError?.message ?? `HTTP ${response.status}`,
      hint: humanHint(metaError?.code ?? 0),
      status: response.status,
    });
  }
  return payload as T;
}
