import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Megaphone, Pause, Play, Send } from 'lucide-react';
import { requireStaff, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ALL_PLATFORMS, capabilitiesFor } from '@/server/platform/capabilities';
import { pauseCampaignAction, publishCampaignAction, resumeCampaignAction } from '@/server/actions/campaigns';
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, DemoBadge, EmptyState,
  LinkButton, PageHeader, StatTile, Table, Td, Th,
} from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { CampaignStatusBadge } from '@/components/ui/status';
import { PlatformChip, SupportPill } from '@/components/ui/platform';
import { formatMoney, relativeTime } from '@/lib/utils';
import type { AppErrorShape } from '@/lib/errors';
import type { AdCampaign, Client } from '@/types/models';

export const metadata: Metadata = { title: 'Ads Manager' };
export const dynamic = 'force-dynamic';

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string; estado?: string }>;
}) {
  const session = await requireStaff('gestao de campanhas');
  const params = await searchParams;
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  let query = db.from('ad_campaigns').select('*').order('created_at', { ascending: false }).limit(150);
  if (ids !== null) query = query.in('client_id', ids.length ? ids : fallback);
  if (params.origem) query = query.eq('origin', params.origem);
  if (params.estado) query = query.eq('status', params.estado);

  const clientsQuery = ids === null
    ? db.from('clients').select('id, name').neq('status', 'ARCHIVED')
    : db.from('clients').select('id, name').in('id', ids.length ? ids : fallback);

  const [{ data }, { data: clientRows }] = await Promise.all([query, clientsQuery]);
  const campaigns = (data ?? []) as AdCampaign[];
  const clientName = new Map(((clientRows ?? []) as Pick<Client, 'id' | 'name'>[]).map((c) => [c.id, c.name]));

  const manual = campaigns.filter((c) => c.origin === 'MANUAL');
  const automatic = campaigns.filter((c) => c.origin === 'AUTOMATIC');
  const active = campaigns.filter((c) => c.status === 'ACTIVE');
  const totalDaily = active.reduce((sum, c) => sum + Number(c.daily_budget ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ads Manager"
        description="Criar, publicar, pausar e acompanhar campanhas sem sair do NojAds — dentro do que cada API oficial permite."
        actions={<LinkButton href="/ads/novo" variant="primary" icon={Plus}>Criar anuncio</LinkButton>}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Campanhas" value={campaigns.length} icon={Megaphone} />
        <StatTile label="Ativas" value={active.length} tone={active.length ? 'ok' : 'neutral'} />
        <StatTile label="Manuais / Automaticas" value={`${manual.length} / ${automatic.length}`} />
        <StatTile label="Orcamento diario ativo"
          value={formatMoney(totalDaily, active[0]?.currency ?? 'USD')}
          hint="Soma dos orcamentos diarios das campanhas ativas." />
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>O que cada plataforma permite</CardTitle>
            <p className="mt-1 text-xs text-muted">
              O botao Criar anuncio so oferece plataformas com conector implementado e configurado.
            </p>
          </div>
        </CardHeader>
        <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ALL_PLATFORMS.map((platform) => {
            const capability = capabilitiesFor(platform);
            return (
              <div key={platform} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <PlatformChip platform={platform} />
                <SupportPill support={capability.ads.support} />
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div><CardTitle>Campanhas</CardTitle></div>
          <form method="get" className="flex gap-2">
            <select name="origem" defaultValue={params.origem ?? ''}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs" aria-label="Origem">
              <option value="">Todas as origens</option>
              <option value="MANUAL">Manuais</option>
              <option value="AUTOMATIC">Automaticas</option>
            </select>
            <select name="estado" defaultValue={params.estado ?? ''}
              className="h-8 rounded-lg border border-line bg-surface px-2 text-xs" aria-label="Estado">
              <option value="">Todos os estados</option>
              {['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'PAUSED', 'FAILED', 'COMPLETED'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button type="submit" className="h-8 rounded-lg border border-line px-3 text-xs hover:bg-raised">
              Filtrar
            </button>
          </form>
        </CardHeader>

        {campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Ainda nao ha campanhas"
            description="Crie um anuncio dentro do NojAds: plataforma, objetivo, criativo, publico, orcamento e revisao — tudo num so ecra."
            action={<LinkButton href="/ads/novo" variant="primary" size="sm">Criar anuncio</LinkButton>}
          />
        ) : (
          <Table className="min-w-[900px]">
            <thead>
              <tr>
                <Th>Campanha</Th>
                <Th>Cliente</Th>
                <Th>Objetivo</Th>
                <Th>Orcamento</Th>
                <Th>Estado</Th>
                <Th>Accoes</Th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const error = campaign.last_error as AppErrorShape | null;
                return (
                  <tr key={campaign.id} className="hover:bg-raised/50">
                    <Td>
                      <Link href={`/ads/${campaign.id}`} className="font-medium text-ink hover:text-brand">
                        {campaign.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-faint">
                        <PlatformChip platform={campaign.platform} />
                        <Badge tone={campaign.origin === 'AUTOMATIC' ? 'info' : 'neutral'}>
                          {campaign.origin === 'AUTOMATIC' ? 'Automatica' : 'Manual'}
                        </Badge>
                        {campaign.is_demo ? <DemoBadge /> : null}
                        <span>{relativeTime(campaign.created_at)}</span>
                      </div>
                      {error ? (
                        <p className="mt-1 max-w-md text-[10px] leading-relaxed text-danger">
                          {error.message}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="text-xs text-muted">{clientName.get(campaign.client_id) ?? '—'}</Td>
                    <Td className="text-xs text-muted">{campaign.objective.replace('OUTCOME_', '')}</Td>
                    <Td className="text-xs tabular-nums">
                      {campaign.daily_budget
                        ? `${formatMoney(Number(campaign.daily_budget), campaign.currency)}/dia`
                        : campaign.lifetime_budget
                          ? `${formatMoney(Number(campaign.lifetime_budget), campaign.currency)} total`
                          : '—'}
                    </Td>
                    <Td>
                      <CampaignStatusBadge status={campaign.status} />
                      {campaign.external_status && campaign.external_status !== campaign.status ? (
                        <span className="mt-0.5 block text-[10px] text-faint">
                          plataforma: {campaign.external_status}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!campaign.external_id && campaign.status === 'DRAFT' ? (
                          <ActionButton
                            size="sm" variant="primary" icon={Send}
                            confirm={
                              `Publicar "${campaign.name}" em ${campaign.platform}?\n\n` +
                              'A campanha e criada na plataforma EM PAUSA. Nada comeca a gastar ' +
                              'ate a ativar explicitamente.'
                            }
                            action={publishCampaignAction.bind(null, campaign.id)}
                          >
                            Publicar
                          </ActionButton>
                        ) : null}
                        {campaign.status === 'ACTIVE' ? (
                          <ActionButton size="sm" icon={Pause}
                            action={pauseCampaignAction.bind(null, campaign.id)}>
                            Pausar
                          </ActionButton>
                        ) : campaign.status === 'PAUSED' && campaign.external_id ? (
                          <ActionButton
                            size="sm" variant="primary" icon={Play}
                            confirm={
                              `Ativar "${campaign.name}"?\n\n` +
                              `A partir deste momento a campanha comeca a investir ` +
                              `${formatMoney(Number(campaign.daily_budget ?? 0), campaign.currency)} por dia.`
                            }
                            action={resumeCampaignAction.bind(null, campaign.id)}
                          >
                            Ativar
                          </ActionButton>
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

      <Alert tone="info" title="Sobre pagamentos de campanhas">
        O investimento publicitario e cobrado pela propria plataforma, com o metodo de pagamento
        associado a conta publicitaria. Nenhuma API publicitaria oficial permite adicionar
        metodos de pagamento nem cobrar um cartao a partir de uma aplicacao externa. O NojAds
        le e mostra o estado real da faturacao e bloqueia a publicacao quando a conta nao pode
        gastar — mas nao simula um pagamento que nao pode fazer.
      </Alert>
    </div>
  );
}
