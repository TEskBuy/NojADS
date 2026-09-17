import type { Metadata } from 'next';
import { BarChart3, TrendingUp } from 'lucide-react';
import { requireSession, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { TrendChart, CategoryBarChart, AreaTrendChart } from '@/components/charts/charts';
import {
  Alert, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, StatTile,
} from '@/components/ui';
import { formatMoney, formatNumber, formatPercent } from '@/lib/utils';
import type { AnalyticsRow, Client, Platform } from '@/types/models';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

const RANGES = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; dias?: string; plataforma?: string }>;
}) {
  const session = await requireSession('consulta de analytics');
  const params = await searchParams;
  const days = Number(params.dias ?? 30);
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);
  const fallback = ['00000000-0000-0000-0000-000000000000'];

  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  let query = db.from('analytics').select('*').gte('date', since).order('date');
  if (ids !== null) query = query.in('client_id', ids.length ? ids : fallback);
  if (params.client) query = query.eq('client_id', params.client);
  if (params.plataforma) query = query.eq('platform', params.plataforma);

  const clientsQuery = ids === null
    ? db.from('clients').select('id, name').neq('status', 'ARCHIVED').order('name')
    : db.from('clients').select('id, name').in('id', ids.length ? ids : fallback).order('name');

  const [{ data }, { data: clientRows }] = await Promise.all([query, clientsQuery]);
  const rows = (data ?? []) as AnalyticsRow[];
  const clients = (clientRows ?? []) as Pick<Client, 'id' | 'name'>[];

  const totals = rows.reduce((acc, row) => ({
    impressions: acc.impressions + Number(row.impressions ?? 0),
    reach: acc.reach + Number(row.reach ?? 0),
    clicks: acc.clicks + Number(row.clicks ?? 0),
    likes: acc.likes + Number(row.likes ?? 0),
    comments: acc.comments + Number(row.comments ?? 0),
    shares: acc.shares + Number(row.shares ?? 0),
    videoViews: acc.videoViews + Number(row.video_views ?? 0),
    conversions: acc.conversions + Number(row.conversions ?? 0),
    spend: acc.spend + Number(row.spend ?? 0),
  }), {
    impressions: 0, reach: 0, clicks: 0, likes: 0, comments: 0,
    shares: 0, videoViews: 0, conversions: 0, spend: 0,
  });

  const currency = rows.find((r) => r.currency)?.currency ?? 'USD';
  const ctr = totals.impressions ? totals.clicks / totals.impressions : 0;
  const cpc = totals.clicks ? totals.spend / totals.clicks : 0;
  const cpm = totals.impressions ? (totals.spend / totals.impressions) * 1000 : 0;
  const engagement = totals.likes + totals.comments + totals.shares;
  const engagementRate = totals.reach ? engagement / totals.reach : 0;

  // One row per day. Reach and impressions share a scale, so they share a chart.
  const byDate = new Map<string, { date: string; impressions: number; reach: number; clicks: number }>();
  for (const row of rows) {
    const entry = byDate.get(row.date) ?? { date: row.date, impressions: 0, reach: 0, clicks: 0 };
    entry.impressions += Number(row.impressions ?? 0);
    entry.reach += Number(row.reach ?? 0);
    entry.clicks += Number(row.clicks ?? 0);
    byDate.set(row.date, entry);
  }
  const timeSeries = [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({ ...row, date: row.date.slice(5) }));

  // Spend lives on its own chart: a second y-axis is never the answer.
  const spendByDate = new Map<string, number>();
  for (const row of rows) {
    spendByDate.set(row.date, (spendByDate.get(row.date) ?? 0) + Number(row.spend ?? 0));
  }
  const spendSeries = [...spendByDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, spend]) => ({ date: date.slice(5), spend: Math.round(spend * 100) / 100 }));

  const byPlatform = new Map<Platform, { platform: string; impressoes: number; cliques: number }>();
  for (const row of rows) {
    const entry = byPlatform.get(row.platform) ?? { platform: row.platform, impressoes: 0, cliques: 0 };
    entry.impressoes += Number(row.impressions ?? 0);
    entry.cliques += Number(row.clicks ?? 0);
    byPlatform.set(row.platform, entry);
  }
  const platformSeries = [...byPlatform.values()];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Metricas lidas das APIs oficiais e guardadas por dia. Nada aqui e estimado pelo NojAds."
      />

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3 px-5 py-3">
          <select name="client" defaultValue={params.client ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" aria-label="Cliente">
            <option value="">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="plataforma" defaultValue={params.plataforma ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" aria-label="Plataforma">
            <option value="">Todas as plataformas</option>
            {['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'X'].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select name="dias" defaultValue={String(days)}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" aria-label="Periodo">
            {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <button type="submit" className="h-9 rounded-lg border border-line px-4 text-sm hover:bg-raised">
            Aplicar
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={BarChart3}
            title="Ainda nao ha metricas"
            description="Crie uma tarefa de sincronizacao de metricas e ative-a. O NojAds vai buscar os dados as APIs oficiais e guarda um registo por dia."
          />
        </Card>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Impressoes" value={formatNumber(totals.impressions)} icon={TrendingUp} />
            <StatTile label="Alcance" value={formatNumber(totals.reach)} />
            <StatTile label="Cliques" value={formatNumber(totals.clicks)} hint={`CTR ${formatPercent(ctr)}`} />
            <StatTile label="Interacoes" value={formatNumber(engagement)}
              hint={`Taxa ${formatPercent(engagementRate)}`} />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Investimento" value={formatMoney(totals.spend, currency)} tone="brand" />
            <StatTile label="CPC" value={formatMoney(cpc, currency)} />
            <StatTile label="CPM" value={formatMoney(cpm, currency)} />
            <StatTile label="Conversoes" value={formatNumber(totals.conversions)}
              hint={totals.conversions ? `Custo por resultado ${formatMoney(totals.spend / totals.conversions, currency)}` : undefined} />
          </section>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Alcance, impressoes e cliques por dia</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  As tres series partilham a mesma escala, por isso partilham o mesmo eixo.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <TrendChart
                data={timeSeries}
                xKey="date"
                series={[
                  { key: 'impressions', label: 'Impressoes' },
                  { key: 'reach', label: 'Alcance' },
                  { key: 'clicks', label: 'Cliques' },
                ]}
              />
            </CardBody>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Investimento por dia</CardTitle>
                  <p className="mt-1 text-xs text-muted">
                    Grafico proprio: o gasto tem outra escala e nunca partilha eixo com metricas de alcance.
                  </p>
                </div>
              </CardHeader>
              <CardBody>
                <AreaTrendChart
                  data={spendSeries}
                  xKey="date"
                  series={[{
                    key: 'spend',
                    label: `Investimento (${currency})`,
                    format: (v) => formatMoney(v, currency),
                  }]}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <div><CardTitle>Desempenho por plataforma</CardTitle></div>
              </CardHeader>
              <CardBody>
                <CategoryBarChart
                  data={platformSeries}
                  xKey="platform"
                  series={[
                    { key: 'impressoes', label: 'Impressoes' },
                    { key: 'cliques', label: 'Cliques' },
                  ]}
                />
              </CardBody>
            </Card>
          </div>

          <Alert tone="info" title="Como ler estes numeros">
            Cada linha guardada corresponde a uma leitura real da API oficial num dia concreto.
            Quando uma plataforma nao expoe uma metrica, ela fica a zero em vez de ser estimada.
            Metricas de campanhas so aparecem depois de a campanha existir na plataforma.
          </Alert>
        </>
      )}
    </div>
  );
}
