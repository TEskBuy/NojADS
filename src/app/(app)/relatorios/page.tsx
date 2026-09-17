import type { Metadata } from 'next';
import { FileBarChart } from 'lucide-react';
import { requireStaff, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { Badge, Card, CardHeader, CardTitle, EmptyState, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { Client, Report } from '@/types/models';

export const metadata: Metadata = { title: 'Relatorios' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const session = await requireStaff('consulta de relatorios');
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  let query = db.from('reports').select('*').order('created_at', { ascending: false }).limit(60);
  if (ids !== null) query = query.in('client_id', ids.length ? ids : fallback);

  const clientsQuery = ids === null
    ? db.from('clients').select('id, name')
    : db.from('clients').select('id, name').in('id', ids.length ? ids : fallback);

  const [{ data }, { data: clientRows }] = await Promise.all([query, clientsQuery]);
  const reports = (data ?? []) as Report[];
  const clientName = new Map(((clientRows ?? []) as Pick<Client, 'id' | 'name'>[]).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatorios"
        description="Gerados pelas tarefas de relatorio e de otimizacao, a partir de metricas ja sincronizadas."
      />

      <Card>
        <CardHeader>
          <div><CardTitle>Relatorios disponiveis</CardTitle></div>
          <Badge tone="neutral">{String(reports.length)}</Badge>
        </CardHeader>
        {reports.length === 0 ? (
          <EmptyState
            icon={FileBarChart}
            title="Sem relatorios"
            description="Crie uma tarefa do tipo Gerar relatorio ou Analisar e otimizar campanhas e ative-a."
          />
        ) : (
          <ul className="divide-y divide-line">
            {reports.map((report) => {
              const recommendations = report.recommendations as
                { action: string; rationale: string; impact: string }[] | null;
              return (
                <li key={report.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink">{report.title}</p>
                    <Badge tone={report.generated_by === 'AI' ? 'info' : 'neutral'}>
                      {report.generated_by === 'AI' ? 'Com IA' : 'Sistema'}
                    </Badge>
                    {report.is_demo ? <Badge tone="warn">DEMO</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {clientName.get(report.client_id) ?? '—'} ·{' '}
                    {formatDate(report.period_start)} a {formatDate(report.period_end)}
                  </p>
                  {report.summary ? (
                    <p className="mt-2 text-xs leading-relaxed text-muted">{report.summary}</p>
                  ) : null}
                  {recommendations?.length ? (
                    <ul className="mt-2 space-y-1">
                      {recommendations.map((rec, i) => (
                        <li key={i} className="text-[11px] leading-relaxed text-muted">
                          <Badge tone={rec.impact === 'ALTO' ? 'warn' : 'neutral'}>{rec.impact}</Badge>{' '}
                          <strong>{rec.action}</strong> — {rec.rationale}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
