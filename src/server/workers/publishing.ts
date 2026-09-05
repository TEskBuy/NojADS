import 'server-only';
/**
 * Publishing Worker.
 *
 * Takes content whose scheduled time has arrived and pushes it to the network.
 * Three guarantees:
 *   - a publish attempt is recorded before the call, with an idempotency key,
 *     so a retry cannot post twice;
 *   - content in PENDING_APPROVAL is never published, whatever the schedule says;
 *   - PUBLISHED is written only after the platform returns a real id.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import { socialProviderFor } from '@/server/providers/social';
import { contextForSocialAccount } from '@/server/services/tokens';
import { idempotencyKey } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { AppError, normalizeError, ValidationError } from '@/lib/errors';
import { notify, type JobContext } from './context';
import { signedMediaUrls } from '@/server/services/storage';
import type { Content, ContentAsset } from '@/types/models';

/** Task-driven sweep: publishes everything due for this task's client/platform. */
export async function handlePublishScheduled(ctx: JobContext): Promise<Record<string, unknown>> {
  const db = createAdminSupabase();
  const taskId = ctx.taskId;

  let query = db
    .from('content')
    .select('*')
    .eq('status', 'SCHEDULED')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(25);

  if (ctx.clientId) query = query.eq('client_id', ctx.clientId);

  const { data } = await query;
  const items = (data ?? []) as Content[];

  const results: { contentId: string; ok: boolean; error?: string }[] = [];
  for (const content of items) {
    try {
      await publishContent(content.id);
      results.push({ contentId: content.id, ok: true });
    } catch (err) {
      results.push({ contentId: content.id, ok: false, error: normalizeError(err).message });
    }
  }

  return {
    taskId,
    attempted: items.length,
    published: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/** Publishes exactly one piece of content. Also used by the "Publicar agora" button. */
export async function handlePublishContent(ctx: JobContext): Promise<Record<string, unknown>> {
  const contentId = ctx.payload.contentId as string;
  if (!contentId) {
    throw new ValidationError({
      operation: 'publicacao', message: 'Job de publicacao sem contentId.',
    });
  }
  return publishContent(contentId);
}

export async function publishContent(contentId: string): Promise<Record<string, unknown>> {
  const db = createAdminSupabase();
  const operation = 'publicacao de conteudo';

  const { data: content } = await db
    .from('content').select('*').eq('id', contentId).maybeSingle();
  if (!content) {
    throw new AppError({
      code: 'CONTENT_NOT_FOUND', operation, step: 'localizacao do conteudo',
      message: `Conteudo ${contentId} nao encontrado.`, status: 404,
    });
  }

  const item = content as Content;

  if (item.status === 'PUBLISHED') {
    return { contentId, skipped: true, reason: 'ja publicado', externalId: item.external_id };
  }
  if (item.status === 'PENDING_APPROVAL') {
    throw new ValidationError({
      operation,
      step: 'verificacao de aprovacao',
      message: 'Este conteudo aguarda aprovacao e nao pode ser publicado.',
      hint: 'Aprove o conteudo em Conteudo > Aprovacoes, ou mude a tarefa para modo automatico.',
    });
  }
  if (!item.social_account_id) {
    throw new ValidationError({
      operation,
      step: 'verificacao da conta',
      message: 'Este conteudo nao tem conta social associada.',
      hint: 'Escolha a conta de destino antes de publicar.',
    });
  }

  const key = idempotencyKey('pub', item.id, item.social_account_id);

  // A previous attempt that reached the platform wins: never post twice.
  const { data: previous } = await db
    .from('publishing_jobs').select('*').eq('idempotency_key', key).maybeSingle();
  if (previous?.status === 'SUCCEEDED' && previous.external_id) {
    await db.from('content').update({
      status: 'PUBLISHED',
      external_id: previous.external_id,
      external_url: previous.external_url,
      published_at: previous.finished_at,
    }).eq('id', item.id);
    return { contentId, deduplicated: true, externalId: previous.external_id };
  }

  await db.from('content').update({
    status: 'PUBLISHING', attempts: item.attempts + 1,
  }).eq('id', item.id);

  const { data: attempt } = await db.from('publishing_jobs').upsert({
    content_id: item.id,
    client_id: item.client_id,
    platform: item.platform,
    social_account_id: item.social_account_id,
    idempotency_key: key,
    status: 'RUNNING',
    attempt: item.attempts + 1,
    started_at: new Date().toISOString(),
  }, { onConflict: 'idempotency_key' }).select().single();

  try {
    const { data: assetRows } = await db
      .from('content_assets').select('*').eq('content_id', item.id).order('position');
    const assets = (assetRows ?? []) as ContentAsset[];
    const media = await signedMediaUrls(assets);

    const provider = socialProviderFor(item.platform);
    const providerCtx = await contextForSocialAccount(item.social_account_id);

    const result = await provider.publish(providerCtx, {
      format: item.format,
      body: item.body ?? '',
      title: item.title ?? undefined,
      hashtags: item.hashtags,
      linkUrl: item.link_url ?? undefined,
      media,
      idempotencyKey: key,
    });

    await db.from('content').update({
      status: 'PUBLISHED',
      external_id: result.externalId,
      external_url: result.externalUrl ?? null,
      published_at: result.publishedAt,
      last_error: null,
    }).eq('id', item.id);

    await db.from('publishing_jobs').update({
      status: 'SUCCEEDED',
      external_id: result.externalId,
      external_url: result.externalUrl ?? null,
      response: result.raw,
      finished_at: new Date().toISOString(),
    }).eq('id', attempt.id);

    await logger.info({
      channel: 'PUBLISHING', action: 'content.published',
      message: `Publicado em ${item.platform}: ${result.externalId}`,
      clientId: item.client_id, contentId: item.id,
      metadata: { externalUrl: result.externalUrl },
    });

    await notify({
      clientId: item.client_id,
      type: 'CONTENT_PUBLISHED',
      severity: 'SUCCESS',
      title: `Publicado em ${item.platform}`,
      body: (item.body ?? '').slice(0, 120),
      link: result.externalUrl ?? '/conteudo',
      data: { contentId: item.id, externalId: result.externalId },
    });

    return { contentId, externalId: result.externalId, externalUrl: result.externalUrl };
  } catch (err) {
    const appError = normalizeError(err, operation);

    await db.from('content').update({
      status: 'FAILED', last_error: appError.toJSON(),
    }).eq('id', item.id);

    await db.from('publishing_jobs').update({
      status: 'FAILED', error: appError.toJSON(), finished_at: new Date().toISOString(),
    }).eq('id', attempt.id);

    await logger.error({
      channel: 'PUBLISHING', action: 'content.publish_failed',
      message: appError.toDisplay(),
      clientId: item.client_id, contentId: item.id, error: appError,
    });

    await notify({
      clientId: item.client_id,
      type: 'CONTENT_PUBLISH_FAILED',
      severity: 'ERROR',
      title: `Falha ao publicar em ${item.platform}`,
      body: appError.toDisplay(),
      link: `/conteudo/${item.id}`,
      data: { contentId: item.id, code: appError.code },
    });

    throw appError;
  }
}
