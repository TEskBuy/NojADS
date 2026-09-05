/**
 * The error contract: never a bare "Erro." Every failure carries the operation,
 * the step, the reason, a stable code and a hint.
 */
import { describe, expect, it } from 'vitest';
import {
  AppError, AuthorizationError, NotConfiguredError, NotImplementedError,
  NotSupportedError, SpendLimitError, ValidationError, isAppError, normalizeError,
} from '@/lib/errors';

describe('AppError', () => {
  it('inclui operacao, etapa, motivo, codigo e solucao', () => {
    const error = new AppError({
      code: 'TEST', operation: 'publicacao', step: 'envio',
      message: 'A conta nao tem permissao.', hint: 'Verifique as permissoes.',
    });
    const display = error.toDisplay();
    expect(display).toContain('publicacao');
    expect(display).toContain('envio');
    expect(display).toContain('A conta nao tem permissao.');
    expect(display).toContain('Solucao:');
    expect(display).toContain('TEST');
  });

  it('serializa para JSON com todos os campos', () => {
    const json = new AppError({
      code: 'X', operation: 'o', step: 's', message: 'm',
    }).toJSON();
    expect(json).toMatchObject({
      code: 'X', operation: 'o', step: 's', message: 'm',
      severity: 'ERROR', status: 400, retryable: false,
    });
  });
});

describe('erros especializados', () => {
  it('NotSupportedError explica que a plataforma nao permite', () => {
    const error = new NotSupportedError({
      operation: 'eliminacao', platform: 'Instagram',
      reason: 'A API nao expoe eliminacao.',
    });
    expect(error.code).toBe('PLATFORM_NOT_SUPPORTED');
    expect(error.status).toBe(501);
    expect(error.message).toContain('Instagram');
    expect(error.message).toContain('nao suporta');
  });

  it('NotImplementedError distingue-se de NotSupportedError e garante que nada foi enviado', () => {
    const error = new NotImplementedError({ operation: 'publicacao', provider: 'TikTok' });
    expect(error.code).toBe('NOT_IMPLEMENTED');
    expect(error.message).toContain('nada foi enviado nem cobrado');
  });

  it('NotConfiguredError nomeia as variaveis em falta', () => {
    const error = new NotConfiguredError({
      operation: 'ligacao', provider: 'Meta', missing: ['META_APP_ID', 'META_APP_SECRET'],
    });
    expect(error.message).toContain('META_APP_ID');
    expect(error.message).toContain('META_APP_SECRET');
    expect(error.status).toBe(503);
  });

  it('SpendLimitError diz qual limite foi excedido e por quanto', () => {
    const error = new SpendLimitError({
      operation: 'pagamento', limitName: 'Limite diario',
      limit: 100, requested: 250, currency: 'USD',
    });
    expect(error.code).toBe('SPEND_LIMIT_EXCEEDED');
    expect(error.message).toContain('250');
    expect(error.message).toContain('100');
    expect(error.message).toContain('Limite diario');
  });

  it('AuthorizationError e ValidationError trazem sempre uma solucao', () => {
    expect(new AuthorizationError({ operation: 'x' }).hint).toBeTruthy();
    expect(new ValidationError({ operation: 'x', message: 'm' }).hint).toBeTruthy();
  });
});

describe('normalizeError', () => {
  it('devolve o AppError original sem o alterar', () => {
    const original = new ValidationError({ operation: 'x', message: 'm' });
    expect(normalizeError(original)).toBe(original);
  });

  it('converte um Error normal preservando a mensagem', () => {
    const error = normalizeError(new Error('rebentou'), 'tarefa');
    expect(isAppError(error)).toBe(true);
    expect(error.code).toBe('UNEXPECTED_ERROR');
    expect(error.message).toBe('rebentou');
    expect(error.operation).toBe('tarefa');
    expect(error.hint).toBeTruthy();
  });

  it('converte qualquer valor lancado sem nunca ficar sem mensagem', () => {
    for (const thrown of ['texto', 42, null, undefined, { a: 1 }]) {
      const error = normalizeError(thrown);
      expect(error.message.length).toBeGreaterThan(0);
      expect(error.message).not.toBe('Erro.');
      expect(error.hint).toBeTruthy();
    }
  });
});
