import type { Metadata } from 'next';
import Link from 'next/link';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { requireSession, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { scopeToClients } from '@/server/repositories/scope';
import { Badge, Card, CardHeader, CardTitle, EmptyState, PageHeader } from '@/components/ui';
import { PlatformIcon } from '@/components/ui/platform';
import { ContentStatusBadge } from '@/components/ui/status';
import { formatDateTime, truncate } from '@/lib/utils';
import type { AdCampaign, Content, Task } from '@/types/models';

export const metadata: Metadata = { title: 'Calendario' };
export const dynamic = 'force-dynamic';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

function monthBounds(year: number, month: number) {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
  return { start, end };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; vista?: string }>;
}) {
  const session = await requireSession('consulta do calendario');
  const params = await searchParams;
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  const now = new Date();
  const [yearStr, monthStr] = (params.mes ?? `${now.getFullYear()}-${now.getMonth() + 1}`).split('-');
  const year = Number(yearStr) || now.getFullYear();
  const month = (Number(monthStr) || now.getMonth() + 1) - 1;
  const { start, end } = monthBounds(year, month);

  const scopeIn = <T,>(q: T): T => scopeToClients(q, ids);

  const [{ data: contentRows }, { data: taskRows }, { data: campaignRows }] = await Promise.all([
    scopeIn(db.from('content').select('*')
      .gte('scheduled_for', start.toISOString()).lte('scheduled_for', end.toISOString())
      .order('scheduled_for')),
    scopeIn(db.from('tasks').select('*').eq('status', 'ACTIVE')
      .gte('next_run_at', start.toISOString()).lte('next_run_at', end.toISOString())),
    scopeIn(db.from('ad_campaigns').select('*')
      .gte('starts_at', start.toISOString()).lte('starts_at', end.toISOString())),
  ]);

  const content = (contentRows ?? []) as Content[];
  const tasks = (taskRows ?? []) as Task[];
  const campaigns = (campaignRows ?? []) as AdCampaign[];

  const byDay = new Map<number, { content: Content[]; tasks: Task[]; campaigns: AdCampaign[] }>();
  const bucket = (day: number) => {
    const existing = byDay.get(day) ?? { content: [], tasks: [], campaigns: [] };
    byDay.set(day, existing);
    return existing;
  };
  for (const item of content) {
    if (item.scheduled_for) bucket(new Date(item.scheduled_for).getUTCDate()).content.push(item);
  }
  for (const task of tasks) {
    if (task.next_run_at) bucket(new Date(task.next_run_at).getUTCDate()).tasks.push(task);
  }
  for (const campaign of campaigns) {
    if (campaign.starts_at) bucket(new Date(campaign.starts_at).getUTCDate()).campaigns.push(campaign);
  }

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const monthLabel = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(start);

  const prev = month === 0 ? `${year - 1}-12` : `${year}-${month}`;
  const next = month === 11 ? `${year + 1}-1` : `${year}-${month + 2}`;
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendario"
        description="Publicacoes agendadas, proximas execucoes de tarefas e inicios de campanha, no mesmo sitio."
        actions={
          <div className="flex items-center gap-1">
            <Link href={`/calendario?mes=${prev}`}
              className="rounded-lg border border-line p-2 hover:bg-raised" aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Link>
            <span className="min-w-[150px] text-center text-sm font-medium capitalize">{monthLabel}</span>
            <Link href={`/calendario?mes=${next}`}
              className="rounded-lg border border-line p-2 hover:bg-raised" aria-label="Mes seguinte">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden /> Conteudo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-info" aria-hidden /> Execucao de tarefa
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warn" aria-hidden /> Campanha
        </span>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-raised/50">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-faint">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: firstWeekday }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[110px] border-b border-r border-line bg-raised/20" />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const entries = byDay.get(day);
            const isToday = isCurrentMonth && today.getDate() === day;
            return (
              <div key={day} className="min-h-[110px] border-b border-r border-line p-1.5">
                <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium ${
                  isToday ? 'bg-brand text-brand-ink' : 'text-faint'
                }`}>
                  {day}
                </span>
                <div className="mt-1 space-y-1">
                  {entries?.content.slice(0, 3).map((item) => (
                    <Link key={item.id} href={`/conteudo/${item.id}`}
                      className="flex items-start gap-1 rounded bg-brand/10 px-1 py-0.5 text-[10px] leading-tight text-brand hover:bg-brand/20">
                      <PlatformIcon platform={item.platform} className="mt-px h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{truncate(item.title ?? item.body, 24)}</span>
                    </Link>
                  ))}
                  {entries?.content.length && entries.content.length > 3 ? (
                    <span className="block px-1 text-[9px] text-faint">
                      +{entries.content.length - 3} conteudo(s)
                    </span>
                  ) : null}
                  {entries?.tasks.slice(0, 2).map((task) => (
                    <Link key={task.id} href={`/tarefas/${task.id}`}
                      className="block truncate rounded bg-info/10 px-1 py-0.5 text-[10px] leading-tight text-info hover:bg-info/20">
                      {truncate(task.name, 26)}
                    </Link>
                  ))}
                  {entries?.campaigns.slice(0, 2).map((campaign) => (
                    <Link key={campaign.id} href={`/ads/${campaign.id}`}
                      className="block truncate rounded bg-warn/10 px-1 py-0.5 text-[10px] leading-tight text-warn hover:bg-warn/20">
                      {truncate(campaign.name, 26)}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Agenda do mes</CardTitle></div>
          <Badge tone="neutral">{String(content.length)} publicacao(oes)</Badge>
        </CardHeader>
        {content.length === 0 ? (
          <EmptyState icon={CalendarIcon} title="Nada agendado neste mes"
            description="Crie e ative tarefas de conteudo para preencher o calendario." />
        ) : (
          <ul className="divide-y divide-line">
            {content.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                <PlatformIcon platform={item.platform} />
                <div className="min-w-0 flex-1">
                  <Link href={`/conteudo/${item.id}`} className="block truncate text-xs text-ink hover:text-brand">
                    {truncate(item.title ?? item.body, 80)}
                  </Link>
                  <p className="text-[10px] text-faint">
                    {formatDateTime(item.scheduled_for, item.timezone)} · {item.format}
                  </p>
                </div>
                <ContentStatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
