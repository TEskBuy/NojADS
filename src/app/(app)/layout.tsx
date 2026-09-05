import { redirect } from 'next/navigation';
import { getSession } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { Sidebar } from '@/components/layout/sidebar';
import { Topbar } from '@/components/layout/topbar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');

  const db = createAdminSupabase();
  const { count } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.userId)
    .is('read_at', null);

  const unread = count ?? 0;

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar role={session.profile.role} unread={unread} />
      <div className="lg:pl-64">
        <Topbar profile={session.profile} unread={unread} />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
