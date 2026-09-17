'use server';
/** Content mutations: edit, approve, reject, schedule, publish now, cancel. */
import { revalidatePath } from 'next/cache';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireClientAccess } from '@/server/auth/session';
import { contentSchema, fieldErrors } from '@/server/validators/schemas';
import { enqueue } from '@/server/queue/queue';
import { capabilitiesFor } from '@/server/platform/capabilities';
import { idempotencyKey } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { normalizeError, ValidationError } from '@/lib/errors';
import type { ActionState } from './clients';
import type { Content } from '@/types/models';

async function loadContent(contentId: string, operation: string) {
  const db = createAdminSupabase();
  const { data } = await db.from('content').select('*').eq('id', contentId).maybeSingle();
  if (!data) throw new ValidationError({ operation, message: 'Conteudo nao encontrado.' });
  const content = data as Content;
  const { session } = await requireClientAccess(content.client_id, operation, { write: true });
  return { content, session, db };
}

export async function updateContentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const contentId = String(formData.get('content_id') ?? '');
    const { content, session, db } = await loadContent(contentId, 'edicao de conteudo');

    if (content.status === 'PUBLISHED') {
      return {
        ok: false,
        message: 'Este conteudo ja foi publicado e nao pode ser editado no NojAds.',
        hint: 'Edite ou remova a publicacao diretamente na plataforma, quando esta o permitir.',
      };
    }

    const parsed = contentSchema.safeParse({
      client_id: content.client_id,
      platform: formData.get('platform') ?? content.platform,
      social_account_id: formData.get('social_account_id') || content.social_account_id,
      format: formData.get('format') ?? content.format,
      title: formData.get('title'),
      body: formData.get('body'),
      hashtags: String(formData.get('hashtags') ?? '')
        .split(/[,\s]+/).map((h) => h.replace(/^#/, '').trim()).filter(Boolean),
      call_to_action: formData.get('call_to_action'),
      link_url: formData.get('link_url'),
      scheduled_for: formData.get('scheduled_for') || null,
      timezone: formData.get('timezone') ?? content.timezone,
    });

    if (!parsed.success) {
      return { ok: false, message: 'Alguns campos precisam de correcao.', fields: fieldErrors(parsed.error) };
    }

    // Keep a version before overwriting: history is never lost.
    await db.from('content_versions').insert({
      content_id: content.id,
      version: content.version + 1,
      snapshot: {
        title: content.title, body: content.body, hashtags: content.hashtags,
        call_to_action: content.call_to_action, scheduled_for: content.scheduled_for,
      },
      reason: 'Edicao manual',
      created_by: session.userId,
    });

    const { error } = await db.from('content').update({
      title: parsed.data.title ?? null,
      body: parsed.data.body,
      hashtags: parsed.data.hashtags,
      call_to_action: parsed.data.call_to_action ?? null,
      link_url: parsed.data.link_url ?? null,
      scheduled_for: parsed.data.scheduled_for
        ? new Date(parsed.data.scheduled_for).toISOString() : null,
      version: content.version + 1,
    }).eq('id', content.id);

    if (error) return { ok: false, message: `Nao foi possivel guardar: ${error.message}` };

    revalidatePath(`/conteudo/${content.id}`);
    revalidatePath('/conteudo');
    return { ok: true, message: `Conteudo atualizado (versao ${content.version + 1}).` };
  } catch (err) {
    const error = normalizeError(err, 'edicao de conteudo');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function approveContentAction(contentId: string): Promise<ActionState> {
  try {
    const { content, session, db } = await loadContent(contentId, 'aprovacao de conteudo');

    if (content.status !== 'PENDING_APPROVAL') {
      return { ok: false, message: `Este conteudo esta em "${content.status}" e nao aguarda aprovacao.` };
    }

    const scheduled = content.scheduled_for && new Date(content.scheduled_for) > new Date();

    await db.from('content')
      .update({ status: scheduled ? 'SCHEDULED' : 'READY' }).eq('id', contentId);

    await db.from('approvals').update({
      status: 'APPROVED', decided_by: session.userId, decided_at: new Date().toISOString(),
    }).eq('subject', 'CONTENT').eq('subject_id', contentId).eq('status', 'PENDING');

    await logger.info({
      channel: 'ADMIN', action: 'content.approved',
      clientId: content.client_id, contentId, userId: session.userId,
    });

    revalidatePath('/conteudo');
    revalidatePath(`/conteudo/${contentId}`);
    return {
      ok: true,
      message: scheduled
        ? 'Conteudo aprovado e agendado. Sera publicado a hora marcada.'
        : 'Conteudo aprovado. Use "Publicar agora" para o enviar imediatamente.',
    };
  } catch (err) {
    const error = normalizeError(err, 'aprovacao de conteudo');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function rejectContentAction(contentId: string): Promise<ActionState> {
  try {
    const { content, session, db } = await loadContent(contentId, 'rejeicao de conteudo');

    await db.from('content').update({ status: 'CANCELLED' }).eq('id', contentId);
    await db.from('approvals').update({
      status: 'REJECTED', decided_by: session.userId, decided_at: new Date().toISOString(),
    }).eq('subject', 'CONTENT').eq('subject_id', contentId).eq('status', 'PENDING');

    await logger.info({
      channel: 'ADMIN', action: 'content.rejected',
      clientId: content.client_id, contentId, userId: session.userId,
    });

    revalidatePath('/conteudo');
    return { ok: true, message: 'Conteudo rejeitado. Fica no historico, marcado como cancelado.' };
  } catch (err) {
    const error = normalizeError(err, 'rejeicao de conteudo');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function publishNowAction(contentId: string): Promise<ActionState> {
  try {
    const { content, session, db } = await loadContent(contentId, 'publicacao imediata');

    if (content.status === 'PUBLISHED') {
      return { ok: false, message: 'Este conteudo ja foi publicado.' };
    }
    if (content.status === 'PENDING_APPROVAL') {
      return {
        ok: false,
        message: 'Este conteudo aguarda aprovacao.',
        hint: 'Aprove-o primeiro. O NojAds nao publica nada que esteja a espera de decisao.',
      };
    }
    if (!content.social_account_id) {
      return {
        ok: false,
        message: 'Nao ha conta social associada a este conteudo.',
        hint: 'Escolha a conta de destino na edicao do conteudo.',
      };
    }

    const capabilities = capabilitiesFor(content.platform);
    const support = capabilities.social.publish[content.format];
    if (support !== 'SUPPORTED') {
      return {
        ok: false,
        code: 'FORMAT_NOT_SUPPORTED',
        message: `${capabilities.label} nao aceita o formato ${content.format} pela API oficial no NojAds.`,
        hint: support === 'NOT_SUPPORTED'
          ? 'A plataforma nao expoe esta operacao. Publique manualmente na aplicacao.'
          : 'Este formato ainda nao foi implementado no NojAds. Nada foi enviado.',
      };
    }

    await db.from('content').update({ status: 'SCHEDULED', scheduled_for: new Date().toISOString() })
      .eq('id', contentId);

    const { deduplicated } = await enqueue({
      queue: 'publishing',
      type: 'content:publish',
      payload: { contentId },
      idempotencyKey: idempotencyKey('pubjob', contentId),
      priority: 10,
      clientId: content.client_id,
      timeoutSeconds: 900,
    });

    await logger.info({
      channel: 'PUBLISHING', action: 'content.publish_requested',
      clientId: content.client_id, contentId, userId: session.userId,
    });

    revalidatePath(`/conteudo/${contentId}`);
    return {
      ok: true,
      message: deduplicated
        ? 'Ja existia um pedido de publicacao para este conteudo. Nada foi duplicado.'
        : 'Publicacao enviada para a fila. O estado passa a PUBLICADO so quando a plataforma confirmar.',
    };
  } catch (err) {
    const error = normalizeError(err, 'publicacao imediata');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}

export async function cancelContentAction(contentId: string): Promise<ActionState> {
  try {
    const { content, db } = await loadContent(contentId, 'cancelamento de conteudo');
    if (content.status === 'PUBLISHED') {
      return { ok: false, message: 'Conteudo ja publicado nao pode ser cancelado no NojAds.' };
    }
    await db.from('content').update({ status: 'CANCELLED', scheduled_for: null }).eq('id', contentId);
    revalidatePath('/conteudo');
    return { ok: true, message: 'Conteudo cancelado. Continua visivel no historico.' };
  } catch (err) {
    const error = normalizeError(err, 'cancelamento de conteudo');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}
