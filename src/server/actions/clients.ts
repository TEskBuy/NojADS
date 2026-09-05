'use server';
/**
 * Client and brand mutations.
 *
 * Server actions, not API routes: the authorisation check runs on the server
 * before anything else, and RLS is still there underneath if this code is ever
 * wrong.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireClientAccess, requireStaff } from '@/server/auth/session';
import { brandSchema, clientSchema, fieldErrors } from '@/server/validators/schemas';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { slugify } from '@/lib/utils';

export interface ActionState {
  ok: boolean;
  message?: string;
  hint?: string;
  code?: string;
  fields?: Record<string, string[]>;
}

function listFrom(value: FormDataEntryValue | null): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

export async function createClientAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff('criacao de cliente');

  const parsed = clientSchema.safeParse({
    name: formData.get('name'),
    company: formData.get('company'),
    description: formData.get('description'),
    website: formData.get('website'),
    country: formData.get('country'),
    city: formData.get('city'),
    category: formData.get('category'),
    target_audience: formData.get('target_audience'),
    products: listFrom(formData.get('products')),
    services: listFrom(formData.get('services')),
    contact_email: formData.get('contact_email'),
    contact_phone: formData.get('contact_phone'),
    language: formData.get('language') || 'pt',
    timezone: formData.get('timezone') || 'Africa/Luanda',
    currency: formData.get('currency') || 'AOA',
    status: formData.get('status') || 'ACTIVE',
    default_task_mode: formData.get('default_task_mode') || 'APPROVAL',
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: 'Alguns campos precisam de correcao.',
      fields: fieldErrors(parsed.error),
    };
  }

  const db = createAdminSupabase();
  let slug = slugify(parsed.data.name);
  const { data: existing } = await db.from('clients').select('id').eq('slug', slug).maybeSingle();
  if (existing) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const { data, error } = await db.from('clients').insert({
    ...parsed.data, slug, created_by: session.userId,
  }).select('id').single();

  if (error) {
    return {
      ok: false,
      code: 'CLIENT_CREATE_FAILED',
      message: `Nao foi possivel criar o cliente: ${error.message}`,
      hint: 'Verifique se ja existe um cliente com o mesmo nome.',
    };
  }

  // Every client gets a brand profile and a spend-limit record from day one.
  await db.from('brand_settings').insert({ client_id: data.id });
  await db.from('spend_limits').insert({
    client_id: data.id,
    currency: parsed.data.currency,
    block_automatic_payments: true,
    ai_max_budget_increase_pct: 0,
  });

  await logger.info({
    channel: 'ADMIN', action: 'client.created',
    message: `Cliente "${parsed.data.name}" criado.`,
    clientId: data.id, userId: session.userId,
  });

  revalidatePath('/clientes');
  redirect(`/clientes/${data.id}`);
}

export async function updateClientAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const clientId = String(formData.get('client_id') ?? '');
  const { session } = await requireClientAccess(clientId, 'edicao de cliente', { write: true });

  const parsed = clientSchema.safeParse({
    name: formData.get('name'),
    company: formData.get('company'),
    description: formData.get('description'),
    website: formData.get('website'),
    country: formData.get('country'),
    city: formData.get('city'),
    category: formData.get('category'),
    target_audience: formData.get('target_audience'),
    products: listFrom(formData.get('products')),
    services: listFrom(formData.get('services')),
    contact_email: formData.get('contact_email'),
    contact_phone: formData.get('contact_phone'),
    language: formData.get('language') || 'pt',
    timezone: formData.get('timezone') || 'Africa/Luanda',
    currency: formData.get('currency') || 'AOA',
    status: formData.get('status') || 'ACTIVE',
    default_task_mode: formData.get('default_task_mode') || 'APPROVAL',
  });

  if (!parsed.success) {
    return { ok: false, message: 'Alguns campos precisam de correcao.', fields: fieldErrors(parsed.error) };
  }

  const db = createAdminSupabase();
  const { error } = await db.from('clients').update({
    ...parsed.data,
    archived_at: parsed.data.status === 'ARCHIVED' ? new Date().toISOString() : null,
  }).eq('id', clientId);

  if (error) {
    return { ok: false, message: `Nao foi possivel guardar: ${error.message}` };
  }

  await logger.info({
    channel: 'ADMIN', action: 'client.updated',
    clientId, userId: session.userId,
  });

  revalidatePath(`/clientes/${clientId}`);
  revalidatePath('/clientes');
  return { ok: true, message: 'Cliente atualizado.' };
}

export async function updateBrandAction(
  _prev: ActionState, formData: FormData,
): Promise<ActionState> {
  const clientId = String(formData.get('client_id') ?? '');
  const { session } = await requireClientAccess(clientId, 'edicao da identidade da marca', { write: true });

  const parsed = brandSchema.safeParse({
    client_id: clientId,
    logo_url: formData.get('logo_url'),
    primary_colors: listFrom(formData.get('primary_colors')),
    secondary_colors: listFrom(formData.get('secondary_colors')),
    visual_style: formData.get('visual_style'),
    tone_of_voice: formData.get('tone_of_voice'),
    allowed_words: listFrom(formData.get('allowed_words')),
    forbidden_words: listFrom(formData.get('forbidden_words')),
    calls_to_action: listFrom(formData.get('calls_to_action')),
    audience: formData.get('audience'),
    positioning: formData.get('positioning'),
  });

  if (!parsed.success) {
    return { ok: false, message: 'Alguns campos precisam de correcao.', fields: fieldErrors(parsed.error) };
  }

  const db = createAdminSupabase();
  const { error } = await db.from('brand_settings')
    .upsert({ ...parsed.data }, { onConflict: 'client_id' });

  if (error) return { ok: false, message: `Nao foi possivel guardar a marca: ${error.message}` };

  await logger.info({
    channel: 'ADMIN', action: 'brand.updated', clientId, userId: session.userId,
  });

  revalidatePath(`/clientes/${clientId}`);
  return { ok: true, message: 'Identidade da marca atualizada. A IA passa a usar estes dados.' };
}

export async function archiveClientAction(clientId: string): Promise<ActionState> {
  try {
    const { session } = await requireClientAccess(clientId, 'arquivo de cliente', { write: true });
    const db = createAdminSupabase();

    await db.from('clients')
      .update({ status: 'ARCHIVED', archived_at: new Date().toISOString() }).eq('id', clientId);
    // Arquivar para o trabalho automatico: as tarefas param, o historico fica.
    await db.from('tasks')
      .update({ status: 'PAUSED', next_run_at: null })
      .eq('client_id', clientId).eq('status', 'ACTIVE');

    await logger.info({
      channel: 'ADMIN', action: 'client.archived',
      message: 'Cliente arquivado. Tarefas pausadas; historico preservado.',
      clientId, userId: session.userId,
    });

    revalidatePath('/clientes');
    return { ok: true, message: 'Cliente arquivado e tarefas pausadas.' };
  } catch (err) {
    const error = normalizeError(err, 'arquivo de cliente');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}
