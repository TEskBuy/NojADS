import 'server-only';
/**
 * Content Worker.
 *
 * Generates posts, reels, stories and flyer copy with the AI provider, then
 * either schedules them straight away (AUTOMATIC mode) or parks them for
 * review (APPROVAL mode). Nothing is published from here — that is the
 * publishing worker's job, and the separation is what makes approval real.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { aiProvider } from '@/server/providers/ai';
import { capabilitiesFor } from '@/server/platform/capabilities';
import { computeNextRun, specFromTask } from '@/server/tasks/schedule';
import { taskTypeDefinition } from '@/server/tasks/types';
import { logger } from '@/lib/logger';
import { AppError, ValidationError } from '@/lib/errors';
import { buildAIContext, loadClient, loadTask, notify, type JobContext } from './context';
import type { ContentFormat, ContentStatus, Platform, Task } from '@/types/models';

const FORMAT_BY_TYPE: Record<string, ContentFormat> = {
  GENERATE_POSTS: 'POST',
  GENERATE_REELS: 'REEL',
  GENERATE_STORIES: 'STORY',
  GENERATE_FLYERS: 'FLYER',
};

export async function handleGenerateContent(ctx: JobContext): Promise<Record<string, unknown>> {
  const task = await loadTask(ctx.taskId!);
  const definition = taskTypeDefinition(task.type);
  const format = FORMAT_BY_TYPE[task.type] ?? 'POST';
  const platform = (task.platform ?? 'INSTAGRAM') as Platform;

  // Refuse rather than produce content the platform cannot accept.
  const support = capabilitiesFor(platform).social.publish[format];
  if (support && support !== 'SUPPORTED') {
    throw new ValidationError({
      operation: 'geracao de conteudo',
      step: 'verificacao de suporte da plataforma',
      message:
        `O formato ${format} nao esta disponivel para ${platform} ` +
        `(${support === 'NOT_SUPPORTED' ? 'nao suportado pela plataforma' : 'ainda nao implementado no NojAds'}).`,
      hint: 'Altere o formato da tarefa ou escolha outra plataforma.',
    });
  }

  const ai = aiProvider();
  if (!ai.isConfigured()) {
    throw new AppError({
      code: 'AI_NOT_CONFIGURED',
      operation: 'geracao de conteudo',
      step: 'carregamento do provider de IA',
      message: 'Nenhum provider de IA esta configurado nesta instalacao.',
      hint: 'Defina AI_PROVIDER e a chave correspondente. Ate la, nenhum conteudo e gerado — ' +
            'o NojAds nao inventa conteudo sem modelo.',
      status: 503,
    });
  }

  const aiContext = await buildAIContext({
    clientId: task.client_id,
    platform,
    format,
    extraInstructions: (task.config as Record<string, unknown>).instructions as string | undefined,
  });

  const quantity = Math.min(task.quantity, definition?.maxQuantity ?? 10);
  const result = await ai.generatePosts(aiContext, quantity);

  const db = createAdminSupabase();
  await db.from('ai_generations').insert({
    client_id: task.client_id,
    task_id: task.id,
    purpose: `content:${format}`,
    provider: result.usage.provider,
    model: result.usage.model,
    system_prompt: result.prompt.system,
    user_prompt: result.prompt.user,
    response: { count: result.data.length },
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    latency_ms: result.usage.latencyMs,
    status: 'SUCCEEDED',
  });

  const client = await loadClient(task.client_id);
  const slots = await buildScheduleSlots(task, result.data.length);
  const status: ContentStatus = task.mode === 'AUTOMATIC' ? 'SCHEDULED' : 'PENDING_APPROVAL';
  const createdIds: string[] = [];

  for (const [index, post] of result.data.entries()) {
    const { data: created, error } = await db.from('content').insert({
      client_id: task.client_id,
      task_id: task.id,
      task_run_id: ctx.taskRunId ?? null,
      platform,
      social_account_id: task.social_account_id,
      format,
      title: post.title ?? null,
      body: post.body,
      hashtags: post.hashtags ?? [],
      call_to_action: post.callToAction ?? null,
      status,
      scheduled_for: slots[index]?.toISOString() ?? null,
      timezone: task.timezone,
      ai_prompt: result.prompt.user,
      ai_model: result.usage.model,
      ai_metadata: {
        imageBrief: post.imageBrief ?? null,
        videoScript: post.videoScript ?? null,
        provider: result.usage.provider,
      },
      is_demo: client.is_demo,
    }).select('id').single();

    if (error) {
      await logger.error({
        channel: 'AI', action: 'content.insert_failed', message: error.message,
        taskId: task.id, clientId: task.client_id,
      });
      continue;
    }
    createdIds.push(created.id);

    await db.from('content_versions').insert({
      content_id: created.id,
      version: 1,
      snapshot: { body: post.body, hashtags: post.hashtags, title: post.title },
      reason: 'Geracao inicial pela IA',
    });

    if (task.mode === 'APPROVAL') {
      await db.from('approvals').insert({
        client_id: task.client_id,
        subject: 'CONTENT',
        subject_id: created.id,
        summary: `Conteudo ${format} para ${platform}: "${post.body.slice(0, 80)}..."`,
        details: { taskId: task.id, format, platform },
      });
    }
  }

  if (ctx.taskRunId) {
    await db.from('task_runs')
      .update({ produced_content_ids: createdIds })
      .eq('id', ctx.taskRunId);
  }

  await notify({
    clientId: task.client_id,
    type: task.mode === 'APPROVAL' ? 'CONTENT_PENDING_APPROVAL' : 'CONTENT_SCHEDULED',
    severity: task.mode === 'APPROVAL' ? 'WARNING' : 'SUCCESS',
    title: task.mode === 'APPROVAL'
      ? `${createdIds.length} conteudo(s) a aguardar aprovacao`
      : `${createdIds.length} conteudo(s) agendado(s)`,
    body: `Tarefa "${task.name}" — ${format} para ${platform}.`,
    link: '/conteudo',
    data: { taskId: task.id, contentIds: createdIds },
  });

  await logger.info({
    channel: 'AI', action: 'content.generated',
    message: `${createdIds.length} conteudo(s) gerado(s) para ${platform}/${format}.`,
    taskId: task.id, taskRunId: ctx.taskRunId, clientId: task.client_id,
    metadata: { model: result.usage.model, latencyMs: result.usage.latencyMs },
  });

  return { generated: createdIds.length, contentIds: createdIds, mode: task.mode };
}

/**
 * Spreads the generated pieces across the task's own publishing slots, so
 * "3 posts por dia as 09:00, 13:00, 19:00" lands one at each hour instead of
 * three at once.
 */
async function buildScheduleSlots(task: Task, count: number): Promise<Date[]> {
  const spec = specFromTask(task);
  const slots: Date[] = [];
  let cursor = new Date();

  for (let i = 0; i < count; i += 1) {
    const next = computeNextRun({ ...spec, lastRunAt: null }, cursor);
    if (!next) {
      // No schedule left: stagger by two hours so nothing publishes at once.
      slots.push(new Date(Date.now() + (i + 1) * 2 * 3_600_000));
      continue;
    }
    slots.push(next);
    cursor = new Date(next.getTime() + 1000);
  }
  return slots;
}

export async function handleGenerateIdeas(ctx: JobContext): Promise<Record<string, unknown>> {
  const task = await loadTask(ctx.taskId!);
  const ai = aiProvider();
  const aiContext = await buildAIContext({
    clientId: task.client_id,
    platform: (task.platform ?? 'INSTAGRAM') as Platform,
    format: 'POST',
  });

  const result = await ai.generateIdeas(aiContext, task.quantity);
  const db = createAdminSupabase();

  await db.from('ai_generations').insert({
    client_id: task.client_id,
    task_id: task.id,
    purpose: 'ideas',
    provider: result.usage.provider,
    model: result.usage.model,
    system_prompt: result.prompt.system,
    user_prompt: result.prompt.user,
    response: { ideas: result.data },
    input_tokens: result.usage.inputTokens,
    output_tokens: result.usage.outputTokens,
    latency_ms: result.usage.latencyMs,
    status: 'SUCCEEDED',
  });

  await notify({
    clientId: task.client_id,
    type: 'IDEAS_READY',
    severity: 'INFO',
    title: `${result.data.length} sugestoes de conteudo prontas`,
    body: `Tarefa "${task.name}".`,
    link: '/conteudo',
    data: { ideas: result.data },
  });

  return { ideas: result.data };
}
