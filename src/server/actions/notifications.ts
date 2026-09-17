'use server';
import { revalidatePath } from 'next/cache';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireSession } from '@/server/auth/session';
import { normalizeError } from '@/lib/errors';
import type { ActionState } from './clients';

export async function markNotificationReadAction(notificationId: string): Promise<ActionState> {
  try {
    const session = await requireSession('leitura de notificacao');
    const db = createAdminSupabase();
    await db.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId).eq('user_id', session.userId);
    revalidatePath('/notificacoes');
    return { ok: true };
  } catch (err) {
    const error = normalizeError(err, 'leitura de notificacao');
    return { ok: false, message: error.message };
  }
}

export async function markAllReadAction(): Promise<ActionState> {
  try {
    const session = await requireSession('leitura de notificacoes');
    const db = createAdminSupabase();
    const { count } = await db.from('notifications')
      .update({ read_at: new Date().toISOString() }, { count: 'exact' })
      .eq('user_id', session.userId).is('read_at', null);
    revalidatePath('/notificacoes');
    return { ok: true, message: `${count ?? 0} notificacao(oes) marcada(s) como lida(s).` };
  } catch (err) {
    const error = normalizeError(err, 'leitura de notificacoes');
    return { ok: false, message: error.message };
  }
}
