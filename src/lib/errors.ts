/**
 * Humanised errors (requisito 63).
 *
 * Every failure the operator can see carries: which operation failed, at which
 * step, why, a stable code, and what to do about it. `Erro.` alone is never a
 * valid message in this codebase.
 */

export type ErrorSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface AppErrorShape {
  code: string;
  operation: string;
  step: string;
  message: string;
  hint?: string;
  severity: ErrorSeverity;
  status: number;
  details?: Record<string, unknown>;
  retryable: boolean;
}

export class AppError extends Error {
  readonly code: string;
  readonly operation: string;
  readonly step: string;
  readonly hint?: string;
  readonly severity: ErrorSeverity;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;

  constructor(shape: Omit<AppErrorShape, 'severity' | 'status' | 'retryable'> &
    Partial<Pick<AppErrorShape, 'severity' | 'status' | 'retryable'>>) {
    super(shape.message);
    this.name = 'AppError';
    this.code = shape.code;
    this.operation = shape.operation;
    this.step = shape.step;
    this.hint = shape.hint;
    this.severity = shape.severity ?? 'ERROR';
    this.status = shape.status ?? 400;
    this.details = shape.details;
    this.retryable = shape.retryable ?? false;
  }

  toJSON(): AppErrorShape {
    return {
      code: this.code,
      operation: this.operation,
      step: this.step,
      message: this.message,
      hint: this.hint,
      severity: this.severity,
      status: this.status,
      details: this.details,
      retryable: this.retryable,
    };
  }

  /** One-line rendering for logs and toasts. */
  toDisplay(): string {
    const parts = [`${this.operation} — ${this.step}: ${this.message}`];
    if (this.hint) parts.push(`Solucao: ${this.hint}`);
    parts.push(`Codigo: ${this.code}`);
    return parts.join(' ');
  }
}

/** The platform genuinely cannot do this. Never simulate it instead. */
export class NotSupportedError extends AppError {
  constructor(args: { operation: string; platform: string; reason: string; docsUrl?: string }) {
    super({
      code: 'PLATFORM_NOT_SUPPORTED',
      operation: args.operation,
      step: 'verificacao de suporte da plataforma',
      message: `${args.platform} nao suporta esta operacao pela API oficial. ${args.reason}`,
      hint: args.docsUrl
        ? `Consulte a documentacao oficial: ${args.docsUrl}`
        : 'Execute esta operacao diretamente no painel oficial da plataforma.',
      severity: 'WARNING',
      status: 501,
      details: { platform: args.platform, docsUrl: args.docsUrl },
      retryable: false,
    });
    this.name = 'NotSupportedError';
  }
}

/** The integration exists in NojAds but this deployment has no credentials. */
export class NotConfiguredError extends AppError {
  constructor(args: { operation: string; provider: string; missing: string[]; docsPath?: string }) {
    super({
      code: 'INTEGRATION_NOT_CONFIGURED',
      operation: args.operation,
      step: 'carregamento de credenciais',
      message:
        `A integracao ${args.provider} nao esta configurada nesta instalacao. ` +
        `Variaveis em falta: ${args.missing.join(', ')}.`,
      hint: args.docsPath
        ? `Siga ${args.docsPath} e reinicie a aplicacao apos definir as variaveis.`
        : 'Defina as variaveis em .env.local (local) ou nas Environment Variables da Vercel.',
      severity: 'WARNING',
      status: 503,
      details: { provider: args.provider, missing: args.missing },
      retryable: false,
    });
    this.name = 'NotConfiguredError';
  }
}

/**
 * The provider is written but not yet implemented end to end. Distinct from
 * NotSupportedError: the platform CAN do it, NojAds just does not do it yet.
 * Surfacing this instead of a fake success is the whole point.
 */
export class NotImplementedError extends AppError {
  constructor(args: { operation: string; provider: string; plannedFor?: string }) {
    super({
      code: 'NOT_IMPLEMENTED',
      operation: args.operation,
      step: 'execucao no provider',
      message:
        `${args.provider} ainda nao implementa "${args.operation}" no NojAds. ` +
        `A plataforma suporta esta operacao, mas o conector ainda nao foi construido — ` +
        `nada foi enviado nem cobrado.`,
      hint: args.plannedFor
        ? `Previsto para: ${args.plannedFor}. Use o painel oficial da plataforma entretanto.`
        : 'Use o painel oficial da plataforma entretanto.',
      severity: 'WARNING',
      status: 501,
      details: { provider: args.provider },
      retryable: false,
    });
    this.name = 'NotImplementedError';
  }
}

export class ValidationError extends AppError {
  constructor(args: { operation: string; step?: string; message: string; hint?: string; fields?: Record<string, string[]> }) {
    super({
      code: 'VALIDATION_FAILED',
      operation: args.operation,
      step: args.step ?? 'validacao dos dados',
      message: args.message,
      hint: args.hint ?? 'Corrija os campos indicados e tente novamente.',
      severity: 'WARNING',
      status: 422,
      details: args.fields ? { fields: args.fields } : undefined,
      retryable: false,
    });
    this.name = 'ValidationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(args: { operation: string; message?: string; hint?: string }) {
    super({
      code: 'NOT_AUTHORIZED',
      operation: args.operation,
      step: 'verificacao de permissoes',
      message: args.message ?? 'A sua conta nao tem permissao para esta operacao.',
      hint: args.hint ?? 'Peca a um administrador do NojAds para conceder acesso a este cliente.',
      severity: 'WARNING',
      status: 403,
      retryable: false,
    });
    this.name = 'AuthorizationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(operation = 'acesso a area protegida') {
    super({
      code: 'NOT_AUTHENTICATED',
      operation,
      step: 'verificacao de sessao',
      message: 'A sessao expirou ou nao existe.',
      hint: 'Inicie sessao novamente.',
      severity: 'WARNING',
      status: 401,
      retryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

export class NotFoundError extends AppError {
  constructor(args: { operation: string; resource: string; id?: string }) {
    super({
      code: 'NOT_FOUND',
      operation: args.operation,
      step: 'localizacao do registo',
      message: `${args.resource} nao encontrado${args.id ? ` (${args.id})` : ''}.`,
      hint: 'Verifique se o registo ainda existe ou se tem acesso ao cliente correspondente.',
      severity: 'WARNING',
      status: 404,
      retryable: false,
    });
    this.name = 'NotFoundError';
  }
}

/** A call to an external platform failed. Carries the platform's own code. */
export class ProviderError extends AppError {
  constructor(args: {
    operation: string;
    step: string;
    provider: string;
    platformCode?: string | number;
    platformMessage?: string;
    hint?: string;
    status?: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super({
      code: `PROVIDER_${args.provider.toUpperCase()}_${args.platformCode ?? 'ERROR'}`,
      operation: args.operation,
      step: args.step,
      message:
        `A ${args.provider} recusou a operacao` +
        (args.platformMessage ? `: ${args.platformMessage}` : '.'),
      hint: args.hint ?? 'Verifique as permissoes da conta conectada e tente novamente.',
      severity: 'ERROR',
      status: args.status ?? 502,
      details: { provider: args.provider, platformCode: args.platformCode, ...args.details },
      retryable: args.retryable ?? false,
    });
    this.name = 'ProviderError';
  }
}

export class SpendLimitError extends AppError {
  constructor(args: { operation: string; limitName: string; limit: number; requested: number; currency: string }) {
    super({
      code: 'SPEND_LIMIT_EXCEEDED',
      operation: args.operation,
      step: 'verificacao de limites de gasto',
      message:
        `O valor pedido (${args.requested} ${args.currency}) excede o limite ` +
        `"${args.limitName}" definido para este cliente (${args.limit} ${args.currency}).`,
      hint: 'Ajuste o orcamento ou altere os limites em Definicoes > Limites de gasto.',
      severity: 'WARNING',
      status: 409,
      details: args,
      retryable: false,
    });
    this.name = 'SpendLimitError';
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Anything thrown anywhere becomes a well-formed AppError before display. */
export function normalizeError(error: unknown, operation = 'operacao'): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    return new AppError({
      code: 'UNEXPECTED_ERROR',
      operation,
      step: 'execucao',
      message: error.message || 'Ocorreu um erro inesperado.',
      hint: 'Consulte Logs > System para o detalhe tecnico completo.',
      status: 500,
      details: { name: error.name },
    });
  }
  return new AppError({
    code: 'UNEXPECTED_ERROR',
    operation,
    step: 'execucao',
    message: 'Ocorreu um erro inesperado.',
    hint: 'Consulte Logs > System para o detalhe tecnico completo.',
    status: 500,
    details: { raw: String(error) },
  });
}
