import 'server-only';
/**
 * Notification Worker.
 *
 * Fan-out: a notification aimed at a client becomes one per person who can
 * actually see that client, so nobody is told about work they cannot open.
 */
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { JobContext } from './context';

export async function handleFanoutNotification(ctx: JobContext): Promise<Record<string, unknown>> {
  const db = createAdminSupabase();
  const clientId = ctx.payload.clientId as string | undefined;
  const notification = ctx.payload.notification as Record<string, unknown>;

  const recipients = new Set<string>();

  const { data: admins } = await db
    .from('profiles').select('id').eq('role', 'ADMIN').eq('is_active', true);
  for (const admin of (admins ?? []) as { id: string }[]) recipients.add(admin.id);

  if (clientId) {
    const { data: members } = await db
      .from('client_members').select('user_id').eq('client_id', clientId);
    for (const member of (members ?? []) as { user_id: string }[]) recipients.add(member.user_id);
  }

  const rows = [...recipients].map((userId) => ({
    user_id: userId,
    client_id: clientId ?? null,
    type: String(notification.type ?? 'INFO'),
    severity: String(notification.severity ?? 'INFO'),
    title: String(notification.title ?? ''),
    body: notification.body ? String(notification.body) : null,
    link: notification.link ? String(notification.link) : null,
    data: (notification.data as Record<string, unknown>) ?? {},
  }));

  if (rows.length > 0) await db.from('notifications').insert(rows);
  return { delivered: rows.length };
}
