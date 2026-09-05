/**
 * Token vault. AES-256-GCM with a key from TOKEN_ENCRYPTION_KEY.
 *
 * Ciphertext format:  v{keyVersion}.{iv}.{authTag}.{ciphertext}   (all base64url)
 *
 * Access tokens for social platforms never leave the server in plaintext and
 * are never written to a column a browser JWT can read (see social_tokens RLS).
 */
import crypto from 'node:crypto';
import { serverEnv } from './env';
import { AppError } from './errors';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function loadKey(): { key: Buffer; version: number } {
  const env = serverEnv();
  if (!env.tokenEncryptionKey) {
    throw new AppError({
      code: 'ENCRYPTION_KEY_MISSING',
      operation: 'cifragem de token',
      step: 'carregamento da chave',
      message: 'TOKEN_ENCRYPTION_KEY nao esta definida.',
      hint: 'Gere uma chave com "openssl rand -base64 32" e defina TOKEN_ENCRYPTION_KEY.',
      status: 500,
    });
  }
  const key = Buffer.from(env.tokenEncryptionKey, 'base64');
  if (key.length !== 32) {
    throw new AppError({
      code: 'ENCRYPTION_KEY_INVALID',
      operation: 'cifragem de token',
      step: 'validacao da chave',
      message: `TOKEN_ENCRYPTION_KEY tem ${key.length} bytes; sao necessarios exatamente 32.`,
      hint: 'Gere novamente com "openssl rand -base64 32".',
      status: 500,
    });
  }
  return { key, version: env.tokenEncryptionKeyVersion };
}

export function encryptSecret(plaintext: string): string {
  const { key, version } = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    `v${version}`,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  const { key } = loadKey();
  const parts = payload.split('.');
  if (parts.length !== 4 || !parts[0].startsWith('v')) {
    throw new AppError({
      code: 'TOKEN_CIPHERTEXT_MALFORMED',
      operation: 'decifragem de token',
      step: 'leitura do formato',
      message: 'O token guardado nao esta no formato esperado.',
      hint: 'Reconecte a conta social para gerar um token novo.',
      status: 500,
    });
  }
  const [, ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new AppError({
      code: 'TOKEN_DECRYPT_FAILED',
      operation: 'decifragem de token',
      step: 'verificacao de integridade',
      message: 'Nao foi possivel decifrar o token guardado.',
      hint: 'A TOKEN_ENCRYPTION_KEY mudou desde que o token foi guardado. Reconecte a conta social.',
      status: 500,
    });
  }
}

/** Never log a token. When a fingerprint is needed, log this instead. */
export function fingerprint(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Deterministic idempotency key. Same inputs => same key => one side effect. */
export function idempotencyKey(scope: string, ...parts: (string | number | null | undefined)[]): string {
  const material = parts.map((p) => String(p ?? '')).join('|');
  const hash = crypto.createHash('sha256').update(`${scope}|${material}`).digest('hex').slice(0, 40);
  return `${scope}_${hash}`;
}

/** Constant-time comparison for shared secrets and webhook signatures. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
