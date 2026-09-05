import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, Check, X, Send } from 'lucide-react';
import { requireSession, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { approveContentAction, publishNowAction, rejectContentAction } from '@/server/actions/content';
import {
  Alert, Card, CardHeader, CardTitle, DemoBadge, EmptyState, PageHeader, Table, Td, Th,
} from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { ContentStatusBadge } from '@/components/ui/status';
import { PlatformChip } from '@/components/ui/platform';
import { formatDateTime, truncate } from '@/lib/utils';
import type { AppErrorShape } from '@/lib/errors';
import type { Client, Content } from '@/types/models';

export const metadata: Metadata = { title: 'Conteudo' };
export const dynamic = 'force-dynamic';

const STATUSES = [
  'PENDING_APPROVAL', 'SCHEDULED', 'READY', 'PUBLISHED', 'FAILED', 'DRAFT', 'CANCELLED',
];

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string; platform?: string }>;
}) {
  const session = await requireSession('listagem de conteudo');
  const params = await searchParams;
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  let query = db.from('content').select('*').order('created_at', { ascending: false }).limit(150);
  if (ids !== null) query = query.in('client_id', ids.length ? ids : fallback);
  if (params.status) query = query.eq('status', params.status);
  if (params.client) query = query.eq('client_id', params.client);
  if (params.platform) query = query.eq('platform', params.platform);

  const clientsQuery = ids === null
    ? db.from('clients').select('id, name').neq('status', 'ARCHIVED').order('name')
    : db.from('clients').select('id, name').in('id', ids.length ? ids : fallback).order('name');

  const [{ data }, { data: clientRows }] = await Promise.all([query, clientsQuery]);
  const content = (data ?? []) as Content[];
  const clients = (clientRows ?? []) as Pick<Client, 'id' | 'name'>[];
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const pending = content.filter((c) => c.status === 'PENDING_APPROVAL').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conteudo"
        description="Tudo o que a IA gerou e tudo o que ja foi publicado, com o historico completo de cada peca."
      />

      {pending > 0 ? (
        <Alert tone="warning" title={`${pending} conteudo(s) a aguardar aprovacao`}>
          Nada e publicado enquanto espera decisao. Aprove ou rejeite abaixo.
        </Alert>
      ) : null}

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-3">
          <select name="client" defaultValue={params.client ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" aria-label="Cliente">
            <option value="">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="status" defaultValue={params.status ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" aria-label="Estado">
            <option value="">Todos os estados</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select name="platform" defaultValue={params.platform ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" aria-label="Plataforma">
            <option value="">Todas as plataformas</option>
            {['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'X'].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button type="submit" className="h-9 rounded-lg border border-line px-4 text-sm hover:bg-raised">
            Filtrar
          </button>
        </form>

        {content.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sem conteudo"
            description="Crie uma tarefa de geracao de conteudo. Assim que executar, as pecas aparecem aqui."
          />
        ) : (
          <Table className="min-w-[860px]">
            <thead>
              <tr>
                <Th>Conteudo</Th>
                <Th>Cliente</Th>
                <Th>Plataforma</Th>
                <Th>Agendado</Th>
                <Th>Estado</Th>
                <Th>Accoes</Th>
              </tr>
            </thead>
            <tbody>
              {content.map((item) => {
                const error = item.last_error as AppErrorShape | null;
                return (
                  <tr key={item.id} className="hover:bg-raised/50">
                    <Td>
                      <Link href={`/conteudo/${item.id}`} className="text-ink hover:text-brand">
                        {truncate(item.title ?? item.body, 70)}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-faint">
                        <span>{item.format}</span>
                        {item.version > 1 ? <span>v{item.version}</span> : null}
                        {item.is_demo ? <DemoBadge /> : null}
                      </div>
                      {error ? (
                        <p className="mt-1 max-w-md text-[10px] leading-relaxed text-danger">
                          {error.message} {error.hint ? `— ${error.hint}` : ''}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-xs text-muted">{clientName.get(item.client_id) ?? '—'}</Td>
                    <Td><PlatformChip platform={item.platform} /></Td>
                    <Td className="text-xs tabular-nums text-muted">
                      {item.published_at
                        ? <span className="text-ok">{formatDateTime(item.published_at, item.timezone)}</span>
                        : formatDateTime(item.scheduled_for, item.timezone)}
                    </Td>
                    <Td><ContentStatusBadge status={item.status} /></Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.status === 'PENDING_APPROVAL' ? (
                          <>
                            <ActionButton size="sm" variant="primary" icon={Check}
                              action={approveContentAction.bind(null, item.id)}>
                              Aprovar
                            </ActionButton>
                            <ActionButton size="sm" variant="danger" icon={X}
                              confirm="Rejeitar este conteudo? Fica no historico como cancelado."
                              action={rejectContentAction.bind(null, item.id)}>
                              Rejeitar
                            </ActionButton>
                          </>
                        ) : null}
                        {['READY', 'SCHEDULED', 'FAILED'].includes(item.status) ? (
                          <ActionButton size="sm" icon={Send}
                            confirm={`Publicar em ${item.platform} agora?\n\nEsta accao envia o conteudo para a plataforma.`}
                            action={publishNowAction.bind(null, item.id)}>
                            Publicar agora
                          </ActionButton>
                        ) : null}
                        {item.external_url ? (
                          <a href={item.external_url} target="_blank" rel="noreferrer"
                            className="text-xs text-brand hover:underline">Ver publicacao</a>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
