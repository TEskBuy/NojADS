import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { requireSession } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { markAllReadAction, markNotificationReadAction } from '@/server/actions/notifications';
import { Badge, Card, CardHeader, CardTitle, EmptyState, PageHeader } from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { relativeTime } from '@/lib/utils';
import type { Notification } from '@/types/models';

export const metadata: Metadata = { title: 'Notificacoes' };
export const dynamic = 'force-dynamic';

const TONES = { INFO: 'info', SUCCESS: 'ok', WARNING: 'warn', ERROR: 'danger' } as const;

export default async function NotificationsPage() {
  const session = await requireSession('consulta de notificacoes');
  const db = createAdminSupabase();

  const { data } = await db
    .from('notifications').select('*')
    .eq('user_id', session.userId)
    .order('created_at', { ascending: false }).limit(100);

  const notifications = (data ?? []) as Notification[];
  const unread = notifications.filter((n) => !n.read_at);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notificacoes"
        description="Contas ligadas, conteudo publicado, falhas, aprovacoes pendentes e movimentos financeiros."
        actions={unread.length > 0 ? (
          <ActionButton icon={CheckCheck} action={markAllReadAction}>
            Marcar todas como lidas
          </ActionButton>
        ) : undefined}
      />

      <Card>
        <CardHeader>
          <div><CardTitle>Recentes</CardTitle></div>
          {unread.length > 0 ? <Badge tone="danger">{String(unread.length)} por ler</Badge> : null}
        </CardHeader>

        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Sem notificacoes"
            description="O NojAds avisa quando uma conta e ligada, um token expira, uma publicacao falha, uma campanha precisa de aprovacao ou um pagamento muda de estado."
          />
        ) : (
          <ul className="divide-y divide-line">
            {notifications.map((notification) => (
              <li key={notification.id}
                className={`flex items-start gap-3 px-5 py-3 ${notification.read_at ? '' : 'bg-brand/5'}`}>
                <Badge tone={TONES[notification.severity] ?? 'neutral'}>
                  {notification.severity}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{notification.title}</p>
                  {notification.body ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{notification.body}</p>
                  ) : null}
                  <p className="mt-1 flex items-center gap-2 text-[10px] text-faint">
                    <span className="font-mono">{notification.type}</span>
                    <span>{relativeTime(notification.created_at)}</span>
                    {notification.link ? (
                      <Link href={notification.link} className="text-brand hover:underline">Abrir</Link>
                    ) : null}
                  </p>
                </div>
                {!notification.read_at ? (
                  <ActionButton size="sm" variant="ghost"
                    action={markNotificationReadAction.bind(null, notification.id)}>
                    Marcar lida
                  </ActionButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
