import 'server-only';
/**
 * Server-side authorisation.
 *
 * Rule from the spec: never trust the interface. Every route handler and every
 * server action that touches data goes through one of these guards, and RLS in
 * Postgres is the second, independent line of defence.
 */
import { cache } from 'react';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { AuthenticationError, AuthorizationError, NotFoundError } from '@/lib/errors';
import type { Profile, UserRole } from '@/types/models';

export interface Session {
  userId: string;
  email: string;
  profile: Profile;
}

/** De-duplicated per request by React cache(). */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createServerSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;
  return { userId: user.id, email: user.email ?? '', profile: profile as Profile };
});

export async function requireSession(operation = 'acesso a area protegida'): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AuthenticationError(operation);
  if (!session.profile.is_active) {
    throw new AuthorizationError({
      operation,
      message: 'Esta conta esta desativada.',
      hint: 'Contacte um administrador do NojAds para reativar o acesso.',
    });
  }
  return session;
}

export async function requireRole(roles: UserRole[], operation: string): Promise<Session> {
  const session = await requireSession(operation);
  if (!roles.includes(session.profile.role)) {
    throw new AuthorizationError({
      operation,
      message:
        `Esta operacao exige o papel ${roles.join(' ou ')}. ` +
        `A sua conta tem o papel ${session.profile.role}.`,
    });
  }
  return session;
}

export const requireAdmin = (operation: string) => requireRole(['ADMIN'], operation);
export const requireStaff = (operation: string) => requireRole(['ADMIN', 'MANAGER'], operation);

export interface ClientAccess {
  session: Session;
  clientId: string;
  canWrite: boolean;
}

/**
 * Confirms the caller may reach this client, and whether they may write.
 * ADMIN reaches everything; MANAGER/CLIENT only through client_members.
 */
export async function requireClientAccess(
  clientId: string,
  operation: string,
  opts: { write?: boolean } = {},
): Promise<ClientAccess> {
  const session = await requireSession(operation);

  if (session.profile.role === 'ADMIN') {
    return { session, clientId, canWrite: true };
  }

  const db = createAdminSupabase();
  const { data: client } = await db
    .from('clients').select('id').eq('id', clientId).maybeSingle();
  if (!client) throw new NotFoundError({ operation, resource: 'Cliente', id: clientId });

  const { data: membership } = await db
    .from('client_members')
    .select('can_write')
    .eq('client_id', clientId)
    .eq('user_id', session.userId)
    .maybeSingle();

  if (!membership) {
    throw new AuthorizationError({
      operation,
      message: 'A sua conta nao tem acesso a este cliente.',
      hint: 'Peca a um administrador para o adicionar a equipa deste cliente.',
    });
  }

  const canWrite = Boolean(membership.can_write);
  if (opts.write && !canWrite) {
    throw new AuthorizationError({
      operation,
      message: 'Tem acesso de leitura a este cliente, mas nao de escrita.',
      hint: 'Peca a um administrador permissao de escrita para este cliente.',
    });
  }

  return { session, clientId, canWrite };
}

/** Client ids the caller may see. `null` means "all" (ADMIN). */
export async function accessibleClientIds(session: Session): Promise<string[] | null> {
  if (session.profile.role === 'ADMIN') return null;
  const db = createAdminSupabase();
  const { data } = await db
    .from('client_members').select('client_id').eq('user_id', session.userId);
  return (data ?? []).map((row: { client_id: string }) => row.client_id);
}
