import 'server-only';
/**
 * AIProvider.
 *
 * Two real implementations (Anthropic, OpenAI) behind one interface, plus a
 * disabled provider that says so instead of returning invented content. The
 * disabled one is the default: an installation with no AI key generates
 * nothing rather than something fake.
 */
import { serverEnv } from '@/lib/env';
import { NotConfiguredError, AppError } from '@/lib/errors';
import {
  adCopyUserPrompt, analysisUserPrompt, buildSystemPrompt, ideasUserPrompt, postsUserPrompt,
} from './prompts';
import type {
  AIBrandContext, AIProvider, AIResult, GeneratedAdCopy, GeneratedPost,
} from '@/server/providers/types';

/** Models answer with JSON. Fences and stray prose are stripped defensively. */
function parseJson<T>(raw: string, operation: string): T {
  let text = raw.trim();
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError({
      code: 'AI_INVALID_JSON',
      operation,
      step: 'leitura da resposta do modelo',
      message: 'O modelo devolveu uma resposta que nao e JSON valido.',
      hint: 'Tente executar a tarefa novamente. Se persistir, reduza a quantidade pedida.',
      status: 502,
      details: { preview: raw.slice(0, 300) },
      retryable: true,
    });
  }
}

interface RawCompletion {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
}

abstract class BaseAIProvider implements AIProvider {
  abstract readonly name: string;
  abstract isConfigured(): boolean;
  abstract missingConfiguration(): string[];
  protected abstract complete(system: string, user: string, maxTokens: number): Promise<RawCompletion>;
  protected abstract model(): string;

  private async run<T>(
    system: string, user: string, maxTokens: number, operation: string,
  ): Promise<AIResult<T>> {
    const started = Date.now();
    const completion = await this.complete(system, user, maxTokens);
    return {
      data: parseJson<T>(completion.text, operation),
      usage: {
        provider: this.name,
        model: this.model(),
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        latencyMs: Date.now() - started,
      },
      prompt: { system, user },
    };
  }

  async generatePosts(ctx: AIBrandContext, count: number): Promise<AIResult<GeneratedPost[]>> {
    const system = buildSystemPrompt(ctx);
    const user = postsUserPrompt(count, ctx);
    const result = await this.run<{ posts: GeneratedPost[] }>(
      system, user, Math.min(1200 * count + 800, 8000), 'geracao de conteudo');
    return { ...result, data: (result.data.posts ?? []).slice(0, count) };
  }

  async generateAdCopy(ctx: AIBrandContext, variants: number): Promise<AIResult<GeneratedAdCopy[]>> {
    const system = buildSystemPrompt(ctx);
    const user = adCopyUserPrompt(variants);
    const result = await this.run<{ variants: GeneratedAdCopy[] }>(
      system, user, 600 * variants + 600, 'geracao de texto para anuncio');
    return { ...result, data: (result.data.variants ?? []).slice(0, variants) };
  }

  async generateIdeas(ctx: AIBrandContext, count: number): Promise<AIResult<string[]>> {
    const system = buildSystemPrompt(ctx);
    const user = ideasUserPrompt(count);
    const result = await this.run<{ ideas: string[] }>(
      system, user, 120 * count + 500, 'geracao de ideias');
    return { ...result, data: (result.data.ideas ?? []).slice(0, count) };
  }

  async analyzePerformance(ctx: AIBrandContext, metrics: string) {
    const system = buildSystemPrompt(ctx);
    const user = analysisUserPrompt(metrics);
    return this.run<{
      findings: string[];
      recommendations: { action: string; rationale: string; impact: 'ALTO' | 'MEDIO' | 'BAIXO' }[];
    }>(system, user, 2500, 'analise de desempenho');
  }
}

class AnthropicProvider extends BaseAIProvider {
  readonly name = 'anthropic';

  isConfigured() { return Boolean(serverEnv().anthropicApiKey); }
  missingConfiguration() { return this.isConfigured() ? [] : ['ANTHROPIC_API_KEY']; }
  protected model() { return serverEnv().anthropicModel; }

  protected async complete(system: string, user: string, maxTokens: number): Promise<RawCompletion> {
    const env = serverEnv();
    if (!env.anthropicApiKey) {
      throw new NotConfiguredError({
        operation: 'geracao com IA', provider: 'Anthropic',
        missing: ['ANTHROPIC_API_KEY'], docsPath: 'docs/ai.md',
      });
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.anthropicModel,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new AppError({
        code: 'AI_PROVIDER_ERROR',
        operation: 'geracao com IA',
        step: 'chamada a Anthropic',
        message: payload?.error?.message ?? `HTTP ${response.status}`,
        hint: response.status === 429
          ? 'Limite de pedidos atingido. O NojAds vai tentar novamente.'
          : 'Verifique a chave ANTHROPIC_API_KEY e o modelo configurado.',
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    const text = (payload.content ?? [])
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text).join('');

    return {
      text,
      inputTokens: payload.usage?.input_tokens,
      outputTokens: payload.usage?.output_tokens,
    };
  }
}

class OpenAIProvider extends BaseAIProvider {
  readonly name = 'openai';

  isConfigured() { return Boolean(serverEnv().openaiApiKey); }
  missingConfiguration() { return this.isConfigured() ? [] : ['OPENAI_API_KEY']; }
  protected model() { return serverEnv().openaiModel; }

  protected async complete(system: string, user: string, maxTokens: number): Promise<RawCompletion> {
    const env = serverEnv();
    if (!env.openaiApiKey) {
      throw new NotConfiguredError({
        operation: 'geracao com IA', provider: 'OpenAI',
        missing: ['OPENAI_API_KEY'], docsPath: 'docs/ai.md',
      });
    }
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: env.openaiModel,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new AppError({
        code: 'AI_PROVIDER_ERROR',
        operation: 'geracao com IA',
        step: 'chamada a OpenAI',
        message: payload?.error?.message ?? `HTTP ${response.status}`,
        hint: 'Verifique a chave OPENAI_API_KEY e o modelo configurado.',
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    return {
      text: payload.choices?.[0]?.message?.content ?? '',
      inputTokens: payload.usage?.prompt_tokens,
      outputTokens: payload.usage?.completion_tokens,
    };
  }
}

/** Default when no AI key is present. Refuses instead of inventing content. */
class DisabledAIProvider implements AIProvider {
  readonly name = 'none';
  isConfigured() { return false; }
  missingConfiguration() { return ['AI_PROVIDER', 'ANTHROPIC_API_KEY ou OPENAI_API_KEY']; }

  private fail(operation: string): never {
    throw new NotConfiguredError({
      operation,
      provider: 'IA',
      missing: ['AI_PROVIDER', 'ANTHROPIC_API_KEY ou OPENAI_API_KEY'],
      docsPath: 'docs/ai.md',
    });
  }

  generatePosts(): Promise<AIResult<GeneratedPost[]>> { this.fail('geracao de conteudo'); }
  generateAdCopy(): Promise<AIResult<GeneratedAdCopy[]>> { this.fail('geracao de texto para anuncio'); }
  generateIdeas(): Promise<AIResult<string[]>> { this.fail('geracao de ideias'); }
  analyzePerformance(): Promise<AIResult<never>> { this.fail('analise de desempenho'); }
}

export function aiProvider(): AIProvider {
  switch (serverEnv().aiProvider) {
    case 'anthropic': return new AnthropicProvider();
    case 'openai': return new OpenAIProvider();
    default: return new DisabledAIProvider();
  }
}

export { AnthropicProvider, OpenAIProvider, DisabledAIProvider };
