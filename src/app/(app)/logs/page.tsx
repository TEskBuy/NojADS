import type { Metadata } from 'next';
import { ScrollText, Activity } from 'lucide-react';
import { requireStaff, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { queueStats } from '@/server/queue/queue';
import {
  Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, StatTile,
} from '@/components/ui';
import { formatDateTime } from '@/lib/utils';
import type { AppErrorShape } from '@/lib/errors';
import type { ActivityLog, Client } from '@/types/models';

export const metadata: Metadata = { title: 'Logs' };
export const dynamic = 'force-dynamic';

const CHANNELS = ['ADMIN', 'SYSTEM', 'AI', 'PUBLISHING', 'ADS', 'BILLING', 'AUTH', 'WEBHOOK'];
const LEVEL_TONE = { DEBUG: 'neutral', INFO: 'neutral', WARN: 'warn', ERROR: 'danger' } as const;

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string; nivel?: string; client?: string }>;
}) {
  const session = await requireStaff('consulta de logs');
  const params = await searchParams;
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  let query = db.from('activity_logs').select('*')
    .order('created_at', { ascending: false }).limit(200);
  if (ids !== null) query = query.in('client_id', ids.length ? ids : fallback);
  if (params.canal) query = query.eq('channel', params.canal);
  if (params.nivel) query = query.eq('level', params.nivel);
  if (params.client) query = query.eq('client_id', params.client);

  const clientsQuery = ids === null
    ? db.from('clients').select('id, name').neq('status', 'ARCHIVED').order('name')
    : db.from('clients').select('id, name').in('id', ids.length ? ids : fallback).order('name');

  const [{ data }, { data: clientRows }, queues, { data: deadJobs }] = await Promise.all([
    query,
    clientsQuery,
    queueStats(),
    db.from('jobs').select('id, type, queue, last_error, attempts, updated_at')
      .eq('status', 'DEAD').order('updated_at', { ascending: false }).limit(10),
  ]);

  const logs = (data ?? []) as ActivityLog[];
  const clients = (clientRows ?? []) as Pick<Client, 'id' | 'name'>[];
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const totals = queues.reduce((acc, q) => ({
    pending: acc.pending + q.pending,
    running: acc.running + q.running,
    dead: acc.dead + q.dead,
  }), { pending: 0, running: 0, dead: 0 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logs e observabilidade"
        description="Toda a accao do sistema e dos utilizadores fica registada, separada por canal. Tokens e segredos nunca sao gravados."
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Trabalhos pendentes" value={totals.pending} icon={Activity} />
        <StatTile label="Em execucao" value={totals.running} tone={totals.running ? 'info' : 'neutral'} />
        <StatTile label="Sem tentativas" value={totals.dead} tone={totals.dead ? 'danger' : 'neutral'}
          hint="Trabalhos que esgotaram as tentativas. Ficam visiveis em vez de desaparecer." />
      </section>

      {queues.length > 0 ? (
        <Card>
          <CardHeader><div><CardTitle>Filas</CardTitle></div></CardHeader>
          <CardBody className="grid gap-2 sm:grid-cols-3">
            {queues.map((queue) => (
              <div key={queue.queue} className="rounded-lg border border-line px-3 py-2">
                <p className="font-mono text-xs font-medium">{queue.queue}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {queue.pending} pendente(s) · {queue.running} a correr
                  {queue.dead > 0 ? <span className="text-danger"> · {queue.dead} mortos</span> : null}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {(deadJobs ?? []).length > 0 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Trabalhos que esgotaram tentativas</CardTitle>
              <p className="mt-1 text-xs text-muted">
                Nao sao apagados. Corrija a causa e volte a colocar na fila.
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-2">
            {(deadJobs ?? []).map((job: Record<string, unknown>) => {
              const error = job.last_error as AppErrorShape | null;
              return (
                <div key={String(job.id)} className="rounded-lg border border-danger/25 bg-danger/5 p-3">
                  <p className="font-mono text-[11px] font-medium">{String(job.type)}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Fila {String(job.queue)} · {String(job.attempts)} tentativa(s) · {formatDateTime(String(job.updated_at))}
                  </p>
                  {error ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-danger">
                      {error.operation} — {error.step}: {error.message}
                      {error.hint ? <span className="block opacity-80">{error.hint}</span> : null}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div><CardTitle>Registo de atividade</CardTitle></div>
          <form method="get" className="flex flex-wrap gap-2">
            <select name="client" defaultValue={params.client ?? ''}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs" aria-label="Cliente">
              <option value="">Todos os clientes</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select name="canal" defaultValue={params.canal ?? ''}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs" aria-label="Canal">
              <option value="">Todos os canais</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="nivel" defaultValue={params.nivel ?? ''}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs" aria-label="Nivel">
              <option value="">Todos os niveis</option>
              {['INFO', 'WARN', 'ERROR', 'DEBUG'].map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <button type="submit" className="h-8 rounded-lg border border-line px-3 text-xs hover:bg-raised">
              Filtrar
            </button>
          </form>
        </CardHeader>

        {logs.length === 0 ? (
          <EmptyState icon={ScrollText} title="Sem registos"
            description="A atividade aparece aqui assim que houver accoes no sistema." />
        ) : (
          <ul className="divide-y divide-line">
            {logs.map((log) => {
              const error = log.error as AppErrorShape | null;
              return (
                <li key={log.id} className="flex items-start gap-3 px-5 py-2.5">
                  <Badge tone={LEVEL_TONE[log.level]}>{log.channel}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink">{log.message ?? log.action}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-faint">
                      <span className="font-mono">{log.action}</span>
                      {log.client_id ? <span>{clientName.get(log.client_id) ?? log.client_id}</span> : null}
                      <span>{formatDateTime(log.created_at)}</span>
                    </p>
                    {error ? (
                      <p className="mt-1 text-[10px] leading-relaxed text-danger">
                        {error.step}: {error.message}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
