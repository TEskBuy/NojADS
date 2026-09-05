import type { Metadata } from 'next';
import { CreditCard, Receipt, ShieldCheck, TrendingDown } from 'lucide-react';
import { requireStaff, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { scopeToClients } from '@/server/repositories/scope';
import { paymentProvider } from '@/server/providers/payment';
import { ALL_PLATFORMS, capabilitiesFor } from '@/server/platform/capabilities';
import { loadFeeConfig } from '@/server/services/billing';
import { updateSpendLimitsAction } from '@/server/actions/billing';
import { SpendLimitsForm } from '@/components/forms/spend-limits-form';
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader,
  StatTile, Table, Td, Th,
} from '@/components/ui';
import { TransactionStatusBadge } from '@/components/ui/status';
import { PlatformChip, SupportPill } from '@/components/ui/platform';
import { formatDateTime, formatMoney } from '@/lib/utils';
import type {
  BillingAccount, Client, Invoice, PaymentTransaction, SpendLimits,
} from '@/types/models';

export const metadata: Metadata = { title: 'Billing & Pagamentos' };
export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await requireStaff('gestao de billing');
  const params = await searchParams;
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  const clientsQuery = ids === null
    ? db.from('clients').select('*').neq('status', 'ARCHIVED').order('name')
    : db.from('clients').select('*').in('id', ids.length ? ids : fallback).order('name');
  const { data: clientRows } = await clientsQuery;
  const clients = (clientRows ?? []) as Client[];
  const selectedClient = params.client ?? clients[0]?.id;

  const scope = <T,>(q: T): T => scopeToClients(q, ids);

  const [
    { data: txRows }, { data: invoiceRows }, { data: billingRows },
    { data: limitRow }, fees,
  ] = await Promise.all([
    scope(db.from('payment_transactions').select('*').order('created_at', { ascending: false }).limit(50)),
    scope(db.from('invoices').select('*').order('issued_at', { ascending: false }).limit(25)),
    scope(db.from('billing_accounts').select('*')),
    selectedClient
      ? db.from('spend_limits').select('*').eq('client_id', selectedClient).maybeSingle()
      : Promise.resolve({ data: null }),
    loadFeeConfig(),
  ]);

  const transactions = (txRows ?? []) as PaymentTransaction[];
  const invoices = (invoiceRows ?? []) as Invoice[];
  const billingAccounts = (billingRows ?? []) as BillingAccount[];
  const limits = (limitRow as SpendLimits | null) ?? null;
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const gateway = paymentProvider();
  const succeeded = transactions.filter((t) => t.status === 'SUCCEEDED');
  const totals = succeeded.reduce((acc, t) => ({
    adSpend: acc.adSpend + Number(t.ad_spend_amount),
    nojadsFee: acc.nojadsFee + Number(t.nojads_fee),
    gatewayFee: acc.gatewayFee + Number(t.gateway_fee),
    total: acc.total + Number(t.total_amount),
  }), { adSpend: 0, nojadsFee: 0, gatewayFee: 0, total: 0 });
  const currency = succeeded[0]?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing & Pagamentos"
        description="Gasto publicitario, taxa NojAds e taxa do gateway sao sempre valores separados. Nunca aparecem misturados."
      />

      {!gateway.isConfigured() ? (
        <Alert tone="warning" title="Nenhum gateway de pagamento configurado">
          O NojAds nao consegue cobrar nada nesta instalacao. Faltam:{' '}
          <span className="font-mono">{gateway.missingConfiguration().join(', ')}</span>.
          Ate configurar, o modulo funciona como registo e consulta — nenhum pagamento e
          simulado.
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Gasto publicitario" value={formatMoney(totals.adSpend, currency)} icon={TrendingDown}
          hint="Valor destinado a plataforma." />
        <StatTile label="Taxa NojAds" value={formatMoney(totals.nojadsFee, currency)} icon={ShieldCheck}
          hint={`Configurada em ${fees.nojadsFeePercent}%.`} />
        <StatTile label="Taxa do gateway" value={formatMoney(totals.gatewayFee, currency)} icon={CreditCard} />
        <StatTile label="Total cobrado" value={formatMoney(totals.total, currency)} icon={Receipt} tone="brand" />
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>O que cada plataforma permite em faturacao</CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Nenhuma API publicitaria oficial permite adicionar um metodo de pagamento nem cobrar
              um cartao a partir de uma aplicacao externa. O que o NojAds pode fazer, faz. O que
              nao pode, diz.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <Table className="min-w-[720px]">
            <thead>
              <tr>
                <Th>Plataforma</Th>
                <Th>Ler saldo</Th>
                <Th>Metodos de pagamento</Th>
                <Th>Cobrar no NojAds</Th>
                <Th>Carregar saldo</Th>
              </tr>
            </thead>
            <tbody>
              {ALL_PLATFORMS.map((platform) => {
                const billing = capabilitiesFor(platform).billing;
                return (
                  <tr key={platform}>
                    <Td><PlatformChip platform={platform} /></Td>
                    <Td><SupportPill support={billing.readBalance} /></Td>
                    <Td><SupportPill support={billing.listPaymentMethods} /></Td>
                    <Td><SupportPill support={billing.chargeInApp} /></Td>
                    <Td><SupportPill support={billing.topUpPrepaid} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="mt-4 space-y-1.5">
            {capabilitiesFor('FACEBOOK').billing.notes.map((note, i) => (
              <p key={i} className={`text-[11px] leading-relaxed ${note.level === 'WARNING' ? 'text-warn' : 'text-muted'}`}>
                • {note.text}
              </p>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Estado das contas publicitarias</CardTitle></div>
        </CardHeader>
        {billingAccounts.length === 0 ? (
          <EmptyState icon={CreditCard} title="Sem dados de faturacao"
            description="Sincronize as contas publicitarias para ler saldo, moeda e fonte de financiamento reais." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th><Th>Plataforma</Th><Th>Modelo</Th>
                <Th>Saldo</Th><Th>Estado</Th><Th>Operacoes disponiveis</Th>
              </tr>
            </thead>
            <tbody>
              {billingAccounts.map((account) => (
                <tr key={account.id}>
                  <Td className="text-xs">{clientName.get(account.client_id) ?? '—'}</Td>
                  <Td><PlatformChip platform={account.platform} /></Td>
                  <Td className="text-xs">{account.funding_model === 'PREPAID' ? 'Pre-pago' : 'Pos-pago'}</Td>
                  <Td className="text-xs tabular-nums">
                    {account.balance !== null
                      ? formatMoney(Number(account.balance), account.currency ?? 'USD')
                      : '—'}
                  </Td>
                  <Td>
                    <Badge tone={account.status === 'ACTIVE' ? 'ok' : 'danger'}>{account.status}</Badge>
                    {account.status_reason ? (
                      <p className="mt-1 max-w-[220px] text-[10px] leading-relaxed text-danger">
                        {account.status_reason}
                      </p>
                    ) : null}
                  </Td>
                  <Td className="text-[10px] text-muted">
                    {account.supported_operations.join(', ') || '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Limites de gasto</CardTitle>
              <p className="mt-1 text-xs text-muted">
                Verificados antes de qualquer cobranca, nunca depois.
              </p>
            </div>
          </CardHeader>
          <CardBody>
            {clients.length === 0 ? (
              <p className="text-xs text-muted">Crie um cliente para definir limites.</p>
            ) : (
              <>
                <form method="get" className="mb-4 flex gap-2">
                  <select name="client" defaultValue={selectedClient}
                    className="h-9 flex-1 rounded-lg border border-line bg-surface px-3 text-sm" aria-label="Cliente">
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="submit" className="h-9 rounded-lg border border-line px-4 text-sm hover:bg-raised">
                    Ver
                  </button>
                </form>
                {selectedClient ? (
                  <SpendLimitsForm
                    action={updateSpendLimitsAction}
                    clientId={selectedClient}
                    limits={limits}
                  />
                ) : null}
              </>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>Faturas</CardTitle></div>
            <Badge tone="neutral">{String(invoices.length)}</Badge>
          </CardHeader>
          {invoices.length === 0 ? (
            <EmptyState icon={Receipt} title="Sem faturas"
              description="Cada pagamento concluido gera automaticamente uma fatura com o desdobramento completo." />
          ) : (
            <ul className="divide-y divide-line">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-medium">{invoice.number}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(Number(invoice.total_amount), invoice.currency)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-faint">
                    {clientName.get(invoice.client_id)} · {formatDateTime(invoice.issued_at)} · {invoice.status}
                  </p>
                  <p className="mt-1 text-[10px] text-muted">
                    Publicidade {formatMoney(Number(invoice.ad_spend_amount), invoice.currency)}
                    {' · '}NojAds {formatMoney(Number(invoice.nojads_fee), invoice.currency)}
                    {' · '}Gateway {formatMoney(Number(invoice.gateway_fee), invoice.currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader><div><CardTitle>Transacoes</CardTitle></div></CardHeader>
        {transactions.length === 0 ? (
          <EmptyState icon={CreditCard} title="Sem transacoes"
            description="Todas as cobrancas ficam aqui com o desdobramento de valores e a referencia unica." />
        ) : (
          <Table className="min-w-[860px]">
            <thead>
              <tr>
                <Th>Referencia</Th><Th>Cliente</Th><Th>Publicidade</Th>
                <Th>Taxa NojAds</Th><Th>Taxa gateway</Th><Th>Total</Th><Th>Estado</Th><Th>Data</Th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-raised/50">
                  <Td className="font-mono text-[11px]">{tx.reference}</Td>
                  <Td className="text-xs">{clientName.get(tx.client_id) ?? '—'}</Td>
                  <Td className="text-xs tabular-nums">{formatMoney(Number(tx.ad_spend_amount), tx.currency)}</Td>
                  <Td className="text-xs tabular-nums">{formatMoney(Number(tx.nojads_fee), tx.currency)}</Td>
                  <Td className="text-xs tabular-nums">{formatMoney(Number(tx.gateway_fee), tx.currency)}</Td>
                  <Td className="text-xs font-semibold tabular-nums">{formatMoney(Number(tx.total_amount), tx.currency)}</Td>
                  <Td><TransactionStatusBadge status={tx.status} /></Td>
                  <Td className="text-[10px] text-faint">{formatDateTime(tx.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
