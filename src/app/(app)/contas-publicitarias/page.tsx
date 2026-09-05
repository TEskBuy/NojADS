import type { Metadata } from 'next';
import { Wallet, RefreshCw, AlertTriangle } from 'lucide-react';
import { requireStaff, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { scopeToClients } from '@/server/repositories/scope';
import { capabilitiesFor } from '@/server/platform/capabilities';
import { syncAdAccountsAction } from '@/server/actions/accounts';
import {
  Alert, Card, CardHeader, CardTitle, DemoBadge, EmptyState, LinkButton,
  PageHeader, Table, Td, Th,
} from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { ConnectionStatusBadge } from '@/components/ui/status';
import { PlatformChip } from '@/components/ui/platform';
import { formatMoney, relativeTime } from '@/lib/utils';
import type { AdAccount, BillingAccount, Client } from '@/types/models';

export const metadata: Metadata = { title: 'Contas Publicitarias' };
export const dynamic = 'force-dynamic';

export default async function AdAccountsPage() {
  const session = await requireStaff('gestao de contas publicitarias');
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);

  const scope = <T,>(q: T): T => scopeToClients(q, ids);

  const [{ data: accountRows }, { data: billingRows }, { data: clientRows }] = await Promise.all([
    scope(db.from('ad_accounts').select('*').order('created_at', { ascending: false })),
    scope(db.from('billing_accounts').select('*')),
    ids === null
      ? db.from('clients').select('id, name, is_demo').neq('status', 'ARCHIVED').order('name')
      : db.from('clients').select('id, name, is_demo').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']).order('name'),
  ]);

  const accounts = (accountRows ?? []) as AdAccount[];
  const billing = new Map(((billingRows ?? []) as BillingAccount[]).map((b) => [b.external_id ?? '', b]));
  const clients = (clientRows ?? []) as Pick<Client, 'id' | 'name' | 'is_demo'>[];
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas Publicitarias"
        description="As contas publicitarias vem da mesma autorizacao das redes sociais. O NojAds le o estado real de cada conta antes de deixar publicar."
      />

      <Alert tone="info" title="Sobre a faturacao destas contas">
        O NojAds le o saldo, a moeda e a fonte de financiamento que a API oficial expoe. Nenhuma
        plataforma publicitaria permite adicionar metodos de pagamento nem cobrar um cartao por
        API — esses passos continuam a acontecer no painel oficial da plataforma, e o NojAds
        diz isso em vez de fingir o contrario.
      </Alert>

      {clients.length > 0 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sincronizar contas</CardTitle>
              <p className="mt-1 text-xs text-muted">
                Vai buscar as contas publicitarias e o estado de faturacao atual de cada plataforma ligada.
              </p>
            </div>
          </CardHeader>
          <div className="flex flex-wrap gap-3 px-5 py-4">
            {clients.map((client) => (
              <ActionButton
                key={client.id} size="sm" icon={RefreshCw}
                action={syncAdAccountsAction.bind(null, client.id)}
              >
                {client.name}
              </ActionButton>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader><div><CardTitle>Contas detetadas</CardTitle></div></CardHeader>
        {accounts.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Nenhuma conta publicitaria"
            description="Ligue uma conta Meta em Redes Sociais e sincronize. As contas publicitarias com acesso aparecem aqui."
            action={<LinkButton href="/redes-sociais" variant="primary" size="sm">Ir para Redes Sociais</LinkButton>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Conta</Th>
                <Th>Cliente</Th>
                <Th>Plataforma</Th>
                <Th>Moeda</Th>
                <Th>Saldo / Gasto</Th>
                <Th>Faturacao</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => {
                const snapshot = billing.get(account.external_id);
                const capabilities = capabilitiesFor(account.platform);
                const blocked = snapshot && snapshot.status !== 'ACTIVE';
                return (
                  <tr key={account.id} className="hover:bg-raised/50">
                    <Td>
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {account.name ?? account.external_id}
                        {account.is_demo ? <DemoBadge /> : null}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-faint">{account.external_id}</span>
                      {account.business_name ? (
                        <span className="block text-[10px] text-faint">{account.business_name}</span>
                      ) : null}
                    </Td>
                    <Td className="text-xs text-muted">{clientName.get(account.client_id) ?? '—'}</Td>
                    <Td><PlatformChip platform={account.platform} /></Td>
                    <Td className="text-xs tabular-nums">{account.currency ?? '—'}</Td>
                    <Td className="text-xs tabular-nums">
                      {snapshot?.balance !== null && snapshot?.balance !== undefined
                        ? <span className="block">Saldo: {formatMoney(Number(snapshot.balance), account.currency ?? 'USD')}</span>
                        : null}
                      {account.amount_spent !== null
                        ? <span className="block text-faint">Gasto: {formatMoney(Number(account.amount_spent), account.currency ?? 'USD')}</span>
                        : <span className="text-faint">—</span>}
                    </Td>
                    <Td className="text-xs">
                      {snapshot ? (
                        <>
                          <span className="block">{snapshot.funding_model === 'PREPAID' ? 'Pre-pago' : 'Pos-pago'}</span>
                          <span className="block text-[10px] text-faint">
                            Sincronizado {relativeTime(snapshot.last_synced_at)}
                          </span>
                        </>
                      ) : (
                        <span className="text-faint">
                          {capabilities.billing.readBalance === 'SUPPORTED' ? 'Por sincronizar' : 'Nao lido pelo NojAds'}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <ConnectionStatusBadge status={account.status} />
                      {blocked ? (
                        <p className="mt-1 flex max-w-[220px] items-start gap-1 text-[10px] leading-relaxed text-danger">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          {snapshot?.status_reason ?? 'A plataforma reporta que esta conta nao pode gastar.'}
                        </p>
                      ) : null}
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
