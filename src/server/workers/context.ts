import 'server-only';
/** Shared plumbing every worker handler uses. */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { NotFoundError } from '@/lib/errors';
import type {
  AIBrandContext, ProviderContext,
} from '@/server/providers/types';
import type {
  BrandSettings, Client, ContentFormat, Platform, Task,
} from '@/types/models';

export interface JobContext {
  jobId: string;
  taskId?: string;
  taskRunId?: string;
  clientId?: string;
  payload: Record<string, unknown>;
}

export async function loadTask(taskId: string): Promise<Task> {
  const db = createAdminSupabase();
  const { data } = await db.from('tasks').select('*').eq('id', taskId).maybeSingle();
  if (!data) throw new NotFoundError({ operation: 'execucao de tarefa', resource: 'Tarefa', id: taskId });
  return data as Task;
}

export async function loadClient(clientId: string): Promise<Client> {
  const db = createAdminSupabase();
  const { data } = await db.from('clients').select('*').eq('id', clientId).maybeSingle();
  if (!data) throw new NotFoundError({ operation: 'execucao de tarefa', resource: 'Cliente', id: clientId });
  return data as Client;
}

export async function loadBrand(clientId: string): Promise<BrandSettings | null> {
  const db = createAdminSupabase();
  const { data } = await db
    .from('brand_settings').select('*').eq('client_id', clientId).maybeSingle();
  return (data as BrandSettings) ?? null;
}

/**
 * Assembles the context the AI receives: who the client is, how the brand
 * sounds, what was posted recently, and how it performed. Requisito 15 —
 * with this much context, generic output is a bug.
 */
export async function buildAIContext(args: {
  clientId: string;
  platform: Platform;
  format: ContentFormat;
  objective?: string;
  extraInstructions?: string;
}): Promise<AIBrandContext> {
  const db = createAdminSupabase();
  const [client, brand] = await Promise.all([
    loadClient(args.clientId),
    loadBrand(args.clientId),
  ]);

  const { data: recent } = await db
    .from('content')
    .select('body, published_at')
    .eq('client_id', args.clientId)
    .eq('platform', args.platform)
    .eq('status', 'PUBLISHED')
    .order('published_at', { ascending: false })
    .limit(8);

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: metrics } = await db
    .from('analytics')
    .select('impressions, reach, clicks, likes, comments, engagement_rate, date')
    .eq('client_id', args.clientId)
    .eq('platform', args.platform)
    .gte('date', since)
    .order('date', { ascending: false })
    .limit(30);

  let metricsSummary: string | undefined;
  if (metrics && metrics.length > 0) {
    const totals = metrics.reduce(
      (acc, row) => ({
        impressions: acc.impressions + Number(row.impressions ?? 0),
        reach: acc.reach + Number(row.reach ?? 0),
        clicks: acc.clicks + Number(row.clicks ?? 0),
        likes: acc.likes + Number(row.likes ?? 0),
        comments: acc.comments + Number(row.comments ?? 0),
      }),
      { impressions: 0, reach: 0, clicks: 0, likes: 0, comments: 0 },
    );
    metricsSummary =
      `Ultimos 30 dias: ${totals.impressions} impressoes, ${totals.reach} alcance, ` +
      `${totals.clicks} cliques, ${totals.likes} gostos, ${totals.comments} comentarios.`;
  }

  return {
    client: {
      name: client.name,
      company: client.company,
      description: client.description,
      category: client.category,
      target_audience: client.target_audience,
      products: client.products,
      services: client.services,
      language: client.language,
      country: client.country,
      city: client.city,
      website: client.website,
    },
    brand: brand ? {
      tone_of_voice: brand.tone_of_voice,
      visual_style: brand.visual_style,
      allowed_words: brand.allowed_words,
      forbidden_words: brand.forbidden_words,
      calls_to_action: brand.calls_to_action,
      audience: brand.audience,
      positioning: brand.positioning,
      primary_colors: brand.primary_colors,
    } : null,
    platform: args.platform,
    format: args.format,
    objective: args.objective,
    recentPosts: (recent ?? []).map((r: { body: string | null; published_at: string | null }) => ({
      body: r.body ?? '',
      publishedAt: r.published_at ?? '',
    })),
    metricsSummary,
    extraInstructions: args.extraInstructions,
  };
}

export async function notify(args: {
  clientId?: string | null;
  userId?: string | null;
  type: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  title: string;
  body?: string;
  link?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const db = createAdminSupabase();
  await db.from('notifications').insert({
    client_id: args.clientId ?? null,
    user_id: args.userId ?? null,
    type: args.type,
    severity: args.severity,
    title: args.title,
    body: args.body ?? null,
    link: args.link ?? null,
    data: args.data ?? {},
  });
}

export type { ProviderContext };
