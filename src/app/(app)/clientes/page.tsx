import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Users, Search } from 'lucide-react';
import { requireStaff, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  Badge, Card, DemoBadge, EmptyState, Input, LinkButton, PageHeader, Table, Td, Th,
} from '@/components/ui';
import { formatDate, truncate } from '@/lib/utils';
import type { Client } from '@/types/models';

export const metadata: Metadata = { title: 'Clientes' };
export const dynamic = 'force-dynamic';

const STATUS_TONE = { ACTIVE: 'ok', INACTIVE: 'neutral', ARCHIVED: 'neutral' } as const;
const STATUS_LABEL = { ACTIVE: 'Ativo', INACTIVE: 'Inativo', ARCHIVED: 'Arquivado' } as const;

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requireStaff('listagem de clientes');
  const params = await searchParams;
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);

  let query = db.from('clients').select('*').order('created_at', { ascending: false }).limit(200);
  if (ids !== null) query = query.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  if (params.status) query = query.eq('status', params.status);
  else query = query.neq('status', 'ARCHIVED');
  if (params.q) query = query.ilike('name', `%${params.q}%`);

  const { data } = await query;
  const clients = (data ?? []) as Client[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Cada cliente tem a sua identidade de marca, contas conectadas, tarefas e limites de gasto proprios."
        actions={<LinkButton href="/clientes/novo" variant="primary" icon={Plus}>Novo cliente</LinkButton>}
      />

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-3" method="get">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
            <Input
              name="q" defaultValue={params.q ?? ''} placeholder="Pesquisar por nome…"
              className="pl-9" aria-label="Pesquisar clientes"
            />
          </div>
          <select
            name="status"
            defaultValue={params.status ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm"
            aria-label="Filtrar por estado"
          >
            <option value="">Ativos e inativos</option>
            <option value="ACTIVE">Apenas ativos</option>
            <option value="INACTIVE">Apenas inativos</option>
            <option value="ARCHIVED">Arquivados</option>
          </select>
          <button type="submit" className="h-9 rounded-lg border border-line px-4 text-sm hover:bg-raised">
            Filtrar
          </button>
        </form>

        {clients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={params.q ? 'Nenhum cliente encontrado' : 'Ainda nao ha clientes'}
            description={params.q
              ? 'Ajuste a pesquisa ou o filtro de estado.'
              : 'Comece por criar o primeiro cliente. Depois configure a marca, conecte as redes e crie tarefas.'}
            action={params.q ? undefined : <LinkButton href="/clientes/novo" variant="primary" size="sm">Criar cliente</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>Categoria</Th>
                <Th>Local</Th>
                <Th>Moeda</Th>
                <Th>Modo</Th>
                <Th>Estado</Th>
                <Th>Criado</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="transition-colors hover:bg-raised/50">
                  <Td>
                    <Link href={`/clientes/${client.id}`} className="font-medium text-ink hover:text-brand">
                      {client.name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-2">
                      {client.company ? (
                        <span className="text-[11px] text-faint">{truncate(client.company, 40)}</span>
                      ) : null}
                      {client.is_demo ? <DemoBadge /> : null}
                    </div>
                  </Td>
                  <Td className="text-xs text-muted">{client.category ?? '—'}</Td>
                  <Td className="text-xs text-muted">
                    {[client.city, client.country].filter(Boolean).join(', ') || '—'}
                  </Td>
                  <Td className="text-xs tabular-nums text-muted">{client.currency}</Td>
                  <Td>
                    <Badge tone={client.default_task_mode === 'AUTOMATIC' ? 'info' : 'warn'}>
                      {client.default_task_mode === 'AUTOMATIC' ? 'Automatico' : 'Aprovacao'}
                    </Badge>
                  </Td>
                  <Td><Badge tone={STATUS_TONE[client.status]}>{STATUS_LABEL[client.status]}</Badge></Td>
                  <Td className="text-xs text-faint">{formatDate(client.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
