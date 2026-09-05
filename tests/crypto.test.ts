/**
 * Token vault and idempotency.
 *
 * The vault must round-trip, must refuse a tampered ciphertext instead of
 * returning garbage, and must never produce the same ciphertext twice for the
 * same input. Idempotency keys must be stable for the same inputs and different
 * for different ones — a retry that changes the key would bill twice.
 */
import { beforeAll, describe, expect, it } from 'vitest';

let crypto: typeof import('@/lib/crypto');

beforeAll(async () => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.TOKEN_ENCRYPTION_KEY_VERSION = '1';
  crypto = await import('@/lib/crypto');
});

describe('cofre de tokens', () => {
  it('cifra e decifra sem perder nada', () => {
    const secret = 'EAAG...token-de-acesso-muito-longo-com-simbolos-!@#$%';
    expect(crypto.decryptSecret(crypto.encryptSecret(secret))).toBe(secret);
  });

  it('nunca produz o mesmo criptograma duas vezes', () => {
    const a = crypto.encryptSecret('mesmo-token');
    const b = crypto.encryptSecret('mesmo-token');
    expect(a).not.toBe(b);
    expect(crypto.decryptSecret(a)).toBe(crypto.decryptSecret(b));
  });

  it('marca o criptograma com a versao da chave', () => {
    expect(crypto.encryptSecret('x').startsWith('v1.')).toBe(true);
  });

  it('recusa um criptograma adulterado em vez de devolver lixo', () => {
    const cipher = crypto.encryptSecret('token');
    const parts = cipher.split('.');
    parts[3] = Buffer.from('adulterado').toString('base64url');
    expect(() => crypto.decryptSecret(parts.join('.'))).toThrowError(/nao foi possivel decifrar/i);
  });

  it('recusa um formato invalido com uma mensagem util', () => {
    expect(() => crypto.decryptSecret('isto-nao-e-um-criptograma'))
      .toThrowError(/formato esperado/i);
  });

  it('a impressao digital nunca revela o token', () => {
    const token = 'token-secreto';
    const print = crypto.fingerprint(token);
    expect(print).toHaveLength(12);
    expect(print).not.toContain(token);
    expect(crypto.fingerprint(token)).toBe(print);
  });
});

describe('idempotencia', () => {
  it('as mesmas entradas produzem sempre a mesma chave', () => {
    const a = crypto.idempotencyKey('pub', 'content-1', 'account-1');
    const b = crypto.idempotencyKey('pub', 'content-1', 'account-1');
    expect(a).toBe(b);
  });

  it('entradas diferentes produzem chaves diferentes', () => {
    expect(crypto.idempotencyKey('pub', 'content-1'))
      .not.toBe(crypto.idempotencyKey('pub', 'content-2'));
  });

  it('o mesmo id em ambitos diferentes nao colide', () => {
    expect(crypto.idempotencyKey('pub', 'id'))
      .not.toBe(crypto.idempotencyKey('tx', 'id'));
  });

  it('trata null e undefined de forma estavel', () => {
    expect(crypto.idempotencyKey('x', 'a', null))
      .toBe(crypto.idempotencyKey('x', 'a', undefined));
  });
});

describe('comparacao segura', () => {
  it('aceita valores iguais e recusa diferentes', () => {
    expect(crypto.safeCompare('segredo', 'segredo')).toBe(true);
    expect(crypto.safeCompare('segredo', 'segred0')).toBe(false);
    expect(crypto.safeCompare('curto', 'muito-mais-comprido')).toBe(false);
  });
});
