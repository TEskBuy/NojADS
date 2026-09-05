'use server';
import { revalidatePath } from 'next/cache';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireSession } from '@/server/auth/session';
import { normalizeError } from '@/lib/errors';
import type { ActionState } from './clients';

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requireSession('atualizacao de perfil');
    const fullName = String(formData.get('full_name') ?? '').trim();
    const timezone = String(formData.get('timezone') ?? 'Africa/Luanda');
    const locale = String(formData.get('locale') ?? 'pt');
    const phone = String(formData.get('phone') ?? '').trim() || null;

    if (fullName.length < 2) {
      return { ok: false, message: 'O nome tem de ter pelo menos 2 caracteres.', fields: { full_name: ['Nome demasiado curto.'] } };
    }

    const db = createAdminSupabase();
    // The role is deliberately absent: only an ADMIN changes roles, and a
    // database trigger enforces that independently of this code.
    const { error } = await db.from('profiles')
      .update({ full_name: fullName, timezone, locale, phone })
      .eq('id', session.userId);

    if (error) return { ok: false, message: `Nao foi possivel guardar: ${error.message}` };

    revalidatePath('/definicoes');
    return { ok: true, message: 'Perfil atualizado.' };
  } catch (err) {
    const error = normalizeError(err, 'atualizacao de perfil');
    return { ok: false, message: error.message, hint: error.hint, code: error.code };
  }
}
