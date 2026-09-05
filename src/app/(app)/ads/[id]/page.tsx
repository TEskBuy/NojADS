import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Send, Pause, Play, Check, ExternalLink } from 'lucide-react';
import { requireClientAccess } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { capabilitiesFor } from '@/server/platform/capabilities';
import {
  approveCampaignAction, pauseCampaignAction, publishCampaignAction, resumeCampaignAction,
} from '@/server/actions/campaigns';
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, DemoBadge, PageHeader, StatTile,
} from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { CampaignStatusBadge } from '@/components/ui/status';
import { PlatformChip } from '@/components/ui/platform';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/utils';
import type { AppErrorShape } from '@/lib/errors';
import type { AdCampaign, AdSet, AnalyticsRow, Creative } from '@/types/models';

export const metadata: Metadata = { title: 'Campanha' };
export const dynamic = 'force-dynamic';

export default async function CampaignDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criada?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const db = createAdminSupabase();
  const { data: row } = await db.from('ad_campaigns').select('*').eq('id', id).maybeSingle();
  if (!row) notFound();
  const campaign = row as AdCampaign;

  await requireClientAccess(campaign.client_id, 'consulta de campanha');

  const [{ data: adSetRows }, { data: adRows }, { data: metricRows }, { data: adAccount }] =
    await Promise.all([
      db.from('ad_sets').select('*').eq('campaign_id', id),
      db.from('ads').select('*').eq('campaign_id', id),
      db.from('analytics').select('*').eq('entity_id', id).eq('scope', 'CAMPAIGN')
        .order('date', { ascending: false }).limit(30),
      db.from('ad_accounts').select('*').eq('id', campaign.ad_account_id).maybeSingle(),
    ]);

  const adSets = (adSetRows ?? []) as AdSet[];
  const metrics = (metricRows ?? []) as AnalyticsRow[];
  const capability = capabilitiesFor(campaign.platform);
  const error = campaign.last_error as AppErrorShape | null;

  const creativeIds = (adRows ?? []).map((a: { creative_id: string | null }) => a.creative_id).filter(Boolean) as string[];
  const { data: creativeRows } = creativeIds.length
    ? await db.from('creatives').select('*').in('id', creativeIds)
    : { data: [] };
  const creatives = (creativeRows ?? []) as Creative[];

  const totals = metrics.reduce((acc, row) => ({
    impressions: acc.impressions + Number(row.impressions ?? 0),
    clicks: acc.clicks + Number(row.clicks ?? 0),
    spend: acc.spend + Number(row.spend ?? 0),
    conversions: acc.conversions + Number(row.conversions ?? 0),
  }), { impressions: 0, clicks: 0, spend: 0, conversions: 0 });

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        description={`${capability.label} · ${campaign.objective.replace('OUTCOME_', '')}`}
        breadcrumb={
          <Link href="/ads" className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Ads Manager
          </Link>
        }
        actions={
          <>
            {campaign.is_demo ? <DemoBadge /> : null}
            <CampaignStatusBadge status={campaign.status} />
            {campaign.requires_approval && !campaign.approved_at ? (
              <ActionButton variant="primary" icon={Check} action={approveCampaignAction.bind(null, id)}>
                Aprovar
              </ActionButton>
            ) : null}
            {!campaign.external_id && campaign.status !== 'PUBLISHING' ? (
              <ActionButton
                variant="primary" icon={Send}
                confirm={
                  `Publicar em ${capability.label}?\n\n` +
                  `Sera criada a campanha, o conjunto de anuncios, o criativo e o anuncio.\n` +
                  `Tudo fica EM PAUSA — nada gasta ate ativar.\n\n` +
                  `Orcamento configurado: ${formatMoney(Number(campaign.daily_budget ?? campaign.lifetime_budget ?? 0), campaign.currency)}`
                }
                action={publishCampaignAction.bind(null, id)}
              >
                Publicar na plataforma
              </ActionButton>
            ) : null}
            {campaign.status === 'ACTIVE' ? (
              <ActionButton icon={Pause} action={pauseCampaignAction.bind(null, id)}>Pausar</ActionButton>
            ) : campaign.status === 'PAUSED' && campaign.external_id ? (
              <ActionButton
                variant="primary" icon={Play}
                confirm={
                  `Ativar "${campaign.name}"?\n\n` +
                  `A campanha comeca a investir dinheiro real: ` +
                  `${formatMoney(Number(campaign.daily_budget ?? 0), campaign.currency)} por dia.`
                }
                action={resumeCampaignAction.bind(null, id)}
              >
                Ativar
              </ActionButton>
            ) : null}
          </>
        }
      />

      {query.criada ? (
        <Alert tone="success" title="Campanha guardada como rascunho">
          Ainda nao existe na plataforma. Reveja tudo abaixo e clique em Publicar quando estiver pronto.
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="error" title="Ultima falha">
          <p><strong>{error.operation}</strong> — {error.step}: {error.message}</p>
          {error.hint ? <p className="mt-1">Solucao: {error.hint}</p> : null}
          <p className="mt-1 font-mono text-[10px] opacity-70">Codigo: {error.code}</p>
        </Alert>
      ) : null}

      {campaign.external_id && campaign.status === 'PAUSED' ? (
        <Alert tone="warning" title="Criada na plataforma, mas em pausa">
          A estrutura existe em {capability.label} ({campaign.external_id}) e nao esta a gastar.
          Ative-a quando quiser comecar o investimento.
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Impressoes" value={formatNumber(totals.impressions)} />
        <StatTile label="Cliques" value={formatNumber(totals.clicks)}
          hint={totals.impressions ? `CTR ${((totals.clicks / totals.impressions) * 100).toFixed(2)}%` : undefined} />
        <StatTile label="Investido" value={formatMoney(totals.spend, campaign.currency)}
          hint={totals.clicks ? `CPC ${formatMoney(totals.spend / totals.clicks, campaign.currency)}` : undefined} />
        <StatTile label="Conversoes" value={formatNumber(totals.conversions)}
          hint={totals.conversions ? `Custo por resultado ${formatMoney(totals.spend / totals.conversions, campaign.currency)}` : undefined} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Configuracao</CardTitle></div></CardHeader>
          <CardBody className="space-y-2 text-xs">
            <Row label="Plataforma"><PlatformChip platform={campaign.platform} /></Row>
            <Row label="Conta publicitaria">{adAccount?.name ?? campaign.ad_account_id}</Row>
            <Row label="Objetivo">{campaign.objective}</Row>
            <Row label="Orcamento">
              {campaign.daily_budget
                ? `${formatMoney(Number(campaign.daily_budget), campaign.currency)}/dia`
                : campaign.lifetime_budget
                  ? `${formatMoney(Number(campaign.lifetime_budget), campaign.currency)} total`
                  : '—'}
            </Row>
            <Row label="Nivel do orcamento">{campaign.budget_level === 'CAMPAIGN' ? 'Campanha' : 'Conjunto'}</Row>
            <Row label="Origem">
              <Badge tone={campaign.origin === 'AUTOMATIC' ? 'info' : 'neutral'}>
                {campaign.origin === 'AUTOMATIC' ? 'Automatica' : 'Manual'}
              </Badge>
            </Row>
            <Row label="Comeca">{formatDateTime(campaign.starts_at)}</Row>
            <Row label="Termina">{formatDateTime(campaign.ends_at)}</Row>
            {campaign.approved_at ? <Row label="Aprovada">{formatDateTime(campaign.approved_at)}</Row> : null}
            {campaign.external_id ? (
              <Row label="ID na plataforma">
                <span className="font-mono text-[10px]">{campaign.external_id}</span>
              </Row>
            ) : null}
            {campaign.external_url ? (
              <Row label="Abrir">
                <a href={campaign.external_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand hover:underline">
                  Gestor de Anuncios <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </Row>
            ) : null}
            <Row label="Ultima sincronizacao">{formatDateTime(campaign.last_synced_at)}</Row>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><div><CardTitle>Publico e posicionamentos</CardTitle></div></CardHeader>
          <CardBody className="space-y-3">
            {adSets.map((adSet) => {
              const targeting = adSet.targeting as Record<string, unknown>;
              const placements = adSet.placements as { mode?: string; selected?: string[] };
              return (
                <div key={adSet.id} className="space-y-2 rounded-lg border border-line p-3">
                  <p className="text-xs font-medium">{adSet.name}</p>
                  <div className="space-y-1 text-[11px] text-muted">
                    <p>Paises: {(targeting.countries as string[])?.join(', ') ?? '—'}</p>
                    <p>Idades: {String(targeting.ageMin ?? '—')} a {String(targeting.ageMax ?? '—')}</p>
                    <p>Genero: {(targeting.genders as string[])?.join(', ') ?? 'Todos'}</p>
                    <p>Otimizar para: {adSet.optimization_goal}</p>
                    <p>Cobrar por: {adSet.billing_event}</p>
                    <p>
                      Posicionamentos: {placements?.mode === 'MANUAL'
                        ? (placements.selected ?? []).join(', ')
                        : 'Automaticos'}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>

      {creatives.length > 0 ? (
        <Card>
          <CardHeader><div><CardTitle>Criativo</CardTitle></div></CardHeader>
          <CardBody className="space-y-4">
            {creatives.map((creative) => (
              <div key={creative.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{creative.format}</Badge>
                  {creative.source === 'AI' ? <Badge tone="info">Gerado por IA</Badge> : null}
                  {creative.external_id ? (
                    <span className="font-mono text-[10px] text-faint">{creative.external_id}</span>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{creative.primary_text}</p>
                {creative.headline ? (
                  <p className="mt-2 text-sm font-semibold">{creative.headline}</p>
                ) : null}
                {creative.description ? (
                  <p className="text-xs text-muted">{creative.description}</p>
                ) : null}
                <p className="mt-2 text-[11px] text-faint">
                  Botao: {creative.call_to_action ?? '—'}
                  {creative.destination_url ? ` · ${creative.destination_url}` : ''}
                </p>
                {creative.asset_ids.length === 0 ? (
                  <p className="mt-2 text-[11px] text-warn">
                    Sem media anexada. A plataforma recusa um anuncio sem imagem ou video —
                    anexe no Creative Studio antes de publicar.
                  </p>
                ) : null}
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {capability.ads.notes.length > 0 ? (
        <Card>
          <CardHeader><div><CardTitle>Limites de {capability.label}</CardTitle></div></CardHeader>
          <CardBody>
            <ul className="space-y-1.5">
              {capability.ads.notes.map((note, i) => (
                <li key={i} className={`text-[11px] leading-relaxed ${
                  note.level === 'WARNING' ? 'text-warn' : 'text-muted'
                }`}>
                  • {note.text}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-faint">{label}</span>
      <span className="truncate text-ink">{children}</span>
    </div>
  );
}
