'use client';
/**
 * Manual ad builder (requisitos 22-28).
 *
 * Every option shown comes from the capability registry for the selected
 * platform. Anything the platform does not offer is not rendered; anything
 * NojAds has not built is rendered disabled with the reason attached. The
 * preview mirrors the placement so the operator sees what the audience sees.
 */
import { useMemo, useState } from 'react';
import { Info, Eye, Wallet } from 'lucide-react';
import { ActionForm, SubmitButton, fieldError, type ActionState } from './action-form';
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, Checkbox, Field,
  Input, Select, Textarea,
} from '@/components/ui';
import { PlatformIcon, SupportPill } from '@/components/ui/platform';
import { formatMoney } from '@/lib/utils';
import type { PlatformCapabilities } from '@/server/platform/capabilities';
import type { AdAccount, Client, Platform, SocialAccount } from '@/types/models';

const COUNTRIES = [
  { code: 'AO', name: 'Angola' }, { code: 'PT', name: 'Portugal' },
  { code: 'BR', name: 'Brasil' }, { code: 'MZ', name: 'Mocambique' },
  { code: 'CV', name: 'Cabo Verde' }, { code: 'ZA', name: 'Africa do Sul' },
  { code: 'US', name: 'Estados Unidos' }, { code: 'ES', name: 'Espanha' },
];

export function CampaignForm({
  action, clients, adAccounts, socialAccounts, capabilities, defaultClientId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  clients: Client[];
  adAccounts: AdAccount[];
  socialAccounts: SocialAccount[];
  capabilities: Record<string, PlatformCapabilities>;
  defaultClientId?: string;
}) {
  const platformsWithAds = Object.values(capabilities)
    .filter((c) => c.ads.support === 'SUPPORTED')
    .map((c) => c.platform);

  const [clientId, setClientId] = useState(defaultClientId ?? clients[0]?.id ?? '');
  const [platform, setPlatform] = useState<Platform>(platformsWithAds[0] ?? 'FACEBOOK');
  const [adAccountId, setAdAccountId] = useState('');
  const [objective, setObjective] = useState('');
  const [budgetKind, setBudgetKind] = useState<'daily' | 'lifetime'>('daily');
  const [budget, setBudget] = useState('10');
  const [placementMode, setPlacementMode] = useState<'AUTOMATIC' | 'MANUAL'>('AUTOMATIC');
  const [placements, setPlacements] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>(['AO']);
  const [ageMin, setAgeMin] = useState('18');
  const [ageMax, setAgeMax] = useState('65');
  const [gender, setGender] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL');
  const [creativeFormat, setCreativeFormat] = useState('SINGLE_IMAGE');
  const [primaryText, setPrimaryText] = useState('');
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [cta, setCta] = useState('LEARN_MORE');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const capability = capabilities[platform];
  const clientAdAccounts = adAccounts.filter((a) => a.client_id === clientId && a.platform === platform);
  const selectedAccount = clientAdAccounts.find((a) => a.id === adAccountId) ?? clientAdAccounts[0];
  const currency = selectedAccount?.currency ?? 'USD';
  const pages = socialAccounts.filter((a) => a.client_id === clientId && a.platform === 'FACEBOOK');
  const igAccounts = socialAccounts.filter((a) => a.client_id === clientId && a.platform === 'INSTAGRAM');

  const objectives = capability?.ads.objectives ?? [];
  const selectedObjective = objectives.find((o) => o.value === objective) ?? objectives.find((o) => o.support === 'SUPPORTED');

  const estimate = useMemo(() => {
    const amount = Number(budget) || 0;
    if (budgetKind === 'lifetime') return { total: amount, days: null as number | null };
    const days = endsAt
      ? Math.max(1, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000))
      : 30;
    return { total: amount * days, days };
  }, [budget, budgetKind, endsAt]);

  const groupedPlacements = useMemo(() => {
    const groups = new Map<string, typeof capability.ads.placements>();
    for (const placement of capability?.ads.placements ?? []) {
      const list = groups.get(placement.group) ?? [];
      list.push(placement);
      groups.set(placement.group, list);
    }
    return [...groups.entries()];
  }, [capability]);

  if (platformsWithAds.length === 0) {
    return (
      <Alert tone="warning" title="Nenhuma plataforma de anuncios disponivel">
        Nenhum conector de anuncios esta implementado e configurado nesta instalacao.
        Nenhuma campanha pode ser criada a partir do NojAds neste momento.
      </Alert>
    );
  }

  return (
    <ActionForm action={action} className="space-y-4">
      {(state) => (
        <>
          <input type="hidden" name="targeting" value={JSON.stringify({
            countries, ageMin: Number(ageMin), ageMax: Number(ageMax),
            genders: [gender], languages: [], interests: [], behaviors: [], customAudienceIds: [],
          })} />
          <input type="hidden" name="placements" value={JSON.stringify({
            mode: placementMode, selected: placementMode === 'MANUAL' ? placements : [],
          })} />
          <input type="hidden" name="special_ad_categories" value="[]" />
          <input type="hidden" name="asset_ids" value="[]" />
          <input type="hidden" name="creative_format" value={creativeFormat} />
          <input type="hidden" name="budget_level" value="ADSET" />

          <div className="grid gap-4 xl:grid-cols-3">
            <div className="space-y-4 xl:col-span-2">
              {/* 1. Where */}
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>1. Plataforma e conta</CardTitle>
                    <p className="mt-1 text-xs text-muted">
                      So aparecem plataformas cujo conector de anuncios esta realmente implementado.
                    </p>
                  </div>
                </CardHeader>
                <CardBody className="grid gap-4 sm:grid-cols-2">
                  <Field label="Cliente" required error={fieldError(state, 'client_id')}>
                    <Select name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}{c.is_demo ? ' (DEMO)' : ''}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Plataforma" required error={fieldError(state, 'platform')}>
                    <Select name="platform" value={platform}
                      onChange={(e) => { setPlatform(e.target.value as Platform); setPlacements([]); }} required>
                      {platformsWithAds.map((p) => (
                        <option key={p} value={p}>{capabilities[p].label}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field
                    label="Conta publicitaria" required className="sm:col-span-2"
                    hint={clientAdAccounts.length === 0
                      ? 'Este cliente nao tem contas publicitarias sincronizadas para esta plataforma.'
                      : `Moeda da conta: ${currency}. Os orcamentos sao sempre nesta moeda.`}
                    error={fieldError(state, 'ad_account_id')}
                  >
                    <Select name="ad_account_id" value={adAccountId}
                      onChange={(e) => setAdAccountId(e.target.value)} required>
                      <option value="">Escolha a conta</option>
                      {clientAdAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name ?? a.external_id} · {a.currency} · {a.account_status}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </CardBody>
              </Card>

              {/* 2. Objective */}
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>2. Objetivo</CardTitle>
                    <p className="mt-1 text-xs text-muted">
                      Objetivos oficiais da API, tal como sao. Nada foi inventado.
                    </p>
                  </div>
                </CardHeader>
                <CardBody className="space-y-2">
                  {objectives.map((item) => {
                    const usable = item.support === 'SUPPORTED';
                    return (
                      <label
                        key={item.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                          objective === item.value ? 'border-brand bg-brand/5' : 'border-line hover:bg-raised'
                        } ${usable ? '' : 'cursor-not-allowed opacity-60'}`}
                      >
                        <input
                          type="radio" name="objective" value={item.value}
                          checked={objective === item.value} disabled={!usable}
                          onChange={() => setObjective(item.value)}
                          className="mt-0.5 accent-[rgb(var(--brand))]"
                          required
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium">{item.label}</span>
                            {!usable ? <SupportPill support={item.support} /> : null}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
                            {item.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                  {fieldError(state, 'objective') ? (
                    <p className="text-[11px] font-medium text-danger">{fieldError(state, 'objective')}</p>
                  ) : null}
                </CardBody>
              </Card>

              {/* 3. Creative */}
              <Card>
                <CardHeader><div><CardTitle>3. Criativo</CardTitle></div></CardHeader>
                <CardBody className="space-y-4">
                  <Field label="Formato" required>
                    <Select value={creativeFormat} onChange={(e) => setCreativeFormat(e.target.value)}>
                      {capability?.ads.creativeFormats.map((f) => (
                        <option key={f.value} value={f.value}>{f.label}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Texto principal" required
                    hint="Aparece acima da imagem. Primeira linha e o que prende."
                    error={fieldError(state, 'creative.primary_text')}>
                    <Textarea name="primary_text" rows={4} value={primaryText}
                      onChange={(e) => setPrimaryText(e.target.value)} required maxLength={2000} />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Titulo" hint="Ate 40 caracteres funcionam melhor."
                      error={fieldError(state, 'creative.headline')}>
                      <Input name="headline" value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={80} />
                    </Field>
                    <Field label="Descricao" error={fieldError(state, 'creative.description')}>
                      <Input name="description" value={description}
                        onChange={(e) => setDescription(e.target.value)} maxLength={200} />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Botao" error={fieldError(state, 'creative.call_to_action')}>
                      <Select name="call_to_action" value={cta} onChange={(e) => setCta(e.target.value)}>
                        {capability?.ads.callsToAction.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="URL de destino" error={fieldError(state, 'creative.destination_url')}>
                      <Input name="destination_url" type="url" placeholder="https://" value={destinationUrl}
                        onChange={(e) => setDestinationUrl(e.target.value)} />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Pagina do Facebook" required
                      hint="A Meta exige uma Pagina em todos os anuncios.">
                      <Select name="page_external_id" defaultValue={pages[0]?.external_id ?? ''} required>
                        <option value="">Escolha a Pagina</option>
                        {pages.map((p) => (
                          <option key={p.id} value={p.external_id}>{p.display_name ?? p.external_id}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Conta Instagram" hint="Opcional. Usada nos posicionamentos do Instagram.">
                      <Select name="instagram_external_id" defaultValue="">
                        <option value="">Nenhuma</option>
                        {igAccounts.map((a) => (
                          <option key={a.id} value={a.external_id}>{a.username ?? a.external_id}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Alert tone="info">
                    A media (imagem ou video) e anexada no Creative Studio antes de publicar.
                    Sem media, a plataforma recusa o anuncio — e o NojAds diz isso em vez de
                    fingir que publicou.
                  </Alert>
                </CardBody>
              </Card>

              {/* 4. Audience */}
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>4. Publico</CardTitle>
                    <p className="mt-1 text-xs text-muted">
                      So sao mostradas as dimensoes que a plataforma expoe e o NojAds sabe enviar.
                    </p>
                  </div>
                </CardHeader>
                <CardBody className="space-y-4">
                  <Field label="Paises" required>
                    <div className="flex flex-wrap gap-2">
                      {COUNTRIES.map((country) => {
                        const active = countries.includes(country.code);
                        return (
                          <button
                            key={country.code} type="button"
                            onClick={() => setCountries((prev) =>
                              prev.includes(country.code)
                                ? prev.filter((c) => c !== country.code)
                                : [...prev, country.code])}
                            className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                              active ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:bg-raised'
                            }`}
                            aria-pressed={active}
                          >
                            {country.name}
                          </button>
                        );
                      })}
                    </div>
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Idade minima">
                      <Input type="number" min={13} max={65} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
                    </Field>
                    <Field label="Idade maxima">
                      <Input type="number" min={13} max={65} value={ageMax} onChange={(e) => setAgeMax(e.target.value)} />
                    </Field>
                    <Field label="Genero">
                      <Select value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
                        <option value="ALL">Todos</option>
                        <option value="MALE">Homens</option>
                        <option value="FEMALE">Mulheres</option>
                      </Select>
                    </Field>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      ['Interesses', capability?.ads.targeting.interests],
                      ['Comportamentos', capability?.ads.targeting.behaviors],
                      ['Publicos personalizados', capability?.ads.targeting.customAudiences],
                      ['Semelhantes (lookalike)', capability?.ads.targeting.lookalikeAudiences],
                      ['Remarketing', capability?.ads.targeting.remarketing],
                    ] as const).map(([label, support]) => (
                      <div key={label} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                        <span className="text-xs text-muted">{label}</span>
                        {support ? <SupportPill support={support} /> : null}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-faint">
                    As dimensoes marcadas como nao implementadas existem na API oficial mas ainda
                    nao sao enviadas pelo NojAds. Nao aparecem no formulario porque enviar um
                    publico incompleto seria pior do que ser explicito.
                  </p>
                </CardBody>
              </Card>

              {/* 5. Placements */}
              <Card>
                <CardHeader><div><CardTitle>5. Posicionamentos</CardTitle></div></CardHeader>
                <CardBody className="space-y-3">
                  <div className="flex gap-2">
                    {(['AUTOMATIC', 'MANUAL'] as const).map((mode) => (
                      <button
                        key={mode} type="button" onClick={() => setPlacementMode(mode)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          placementMode === mode ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:bg-raised'
                        }`}
                        aria-pressed={placementMode === mode}
                      >
                        {mode === 'AUTOMATIC' ? 'Automatico (recomendado)' : 'Manual'}
                      </button>
                    ))}
                  </div>

                  {placementMode === 'MANUAL' ? (
                    <div className="space-y-3">
                      {groupedPlacements.map(([group, items]) => (
                        <div key={group}>
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">{group}</p>
                          <div className="space-y-1.5">
                            {items.map((placement) => (
                              <Checkbox
                                key={placement.value}
                                label={placement.label}
                                checked={placements.includes(placement.value)}
                                disabled={placement.support !== 'SUPPORTED'}
                                onChange={() => setPlacements((prev) =>
                                  prev.includes(placement.value)
                                    ? prev.filter((p) => p !== placement.value)
                                    : [...prev, placement.value])}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-muted">
                      A plataforma distribui o anuncio pelos posicionamentos com melhor resultado.
                    </p>
                  )}
                </CardBody>
              </Card>

              {/* 6. Budget */}
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>6. Orcamento e otimizacao</CardTitle>
                    <p className="mt-1 text-xs text-muted">
                      Os valores sao sempre na moeda da conta publicitaria ({currency}).
                    </p>
                  </div>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="flex gap-2">
                    {([['daily', 'Orcamento diario'], ['lifetime', 'Orcamento total']] as const).map(([kind, label]) => (
                      <button
                        key={kind} type="button" onClick={() => setBudgetKind(kind)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          budgetKind === kind ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:bg-raised'
                        }`}
                        aria-pressed={budgetKind === kind}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <Field
                    label={budgetKind === 'daily' ? `Orcamento diario (${currency})` : `Orcamento total (${currency})`}
                    required
                    hint={capability?.ads.budget.minimumDailyBudgetUsd
                      ? `Minimo indicativo da plataforma: cerca de ${capability.ads.budget.minimumDailyBudgetUsd} USD por dia.`
                      : undefined}
                    error={fieldError(state, 'daily_budget')}
                  >
                    <Input
                      name={budgetKind === 'daily' ? 'daily_budget' : 'lifetime_budget'}
                      type="number" min={1} step="0.01" value={budget}
                      onChange={(e) => setBudget(e.target.value)} required
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Comeca em" error={fieldError(state, 'starts_at')}>
                      <Input name="starts_at" type="datetime-local" />
                    </Field>
                    <Field
                      label="Termina em"
                      required={budgetKind === 'lifetime'}
                      hint={budgetKind === 'lifetime' ? 'Obrigatorio com orcamento total.' : 'Opcional.'}
                      error={fieldError(state, 'ends_at')}
                    >
                      <Input name="ends_at" type="datetime-local" value={endsAt}
                        onChange={(e) => setEndsAt(e.target.value)}
                        required={budgetKind === 'lifetime'} />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Otimizar para" required error={fieldError(state, 'optimization_goal')}>
                      <Select name="optimization_goal" defaultValue="LINK_CLICKS" required>
                        {capability?.ads.optimizationGoals.map((g) => (
                          <option key={g.value} value={g.value}>{g.label}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Cobrar por" required error={fieldError(state, 'billing_event')}>
                      <Select name="billing_event" defaultValue="IMPRESSIONS" required>
                        {capability?.ads.billingEvents.map((b) => (
                          <option key={b.value} value={b.value}>{b.label}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Estrategia de lance" error={fieldError(state, 'bid_strategy')}>
                    <Select name="bid_strategy" defaultValue="">
                      <option value="">Predefinicao da plataforma</option>
                      {capability?.ads.budget.bidStrategies.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </Select>
                  </Field>
                </CardBody>
              </Card>
            </div>

            {/* Preview + summary */}
            <div className="space-y-4">
              <Card className="sticky top-20">
                <CardHeader>
                  <div>
                    <CardTitle className="flex items-center gap-1.5">
                      <Eye className="h-4 w-4" aria-hidden /> Pre-visualizacao
                    </CardTitle>
                  </div>
                  <Badge tone="neutral">{placementMode === 'AUTOMATIC' ? 'Feed' : 'Manual'}</Badge>
                </CardHeader>
                <CardBody>
                  <div className="mx-auto max-w-[300px] overflow-hidden rounded-xl border border-line bg-surface">
                    <div className="flex items-center gap-2 p-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-raised">
                        <PlatformIcon platform={platform} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">
                          {pages[0]?.display_name ?? clients.find((c) => c.id === clientId)?.name ?? 'Pagina'}
                        </span>
                        <span className="block text-[10px] text-faint">Patrocinado</span>
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap px-2.5 pb-2 text-[11px] leading-relaxed">
                      {primaryText || 'O texto principal do anuncio aparece aqui.'}
                    </p>
                    <div className="flex aspect-square items-center justify-center border-y border-line bg-raised">
                      <span className="px-4 text-center text-[10px] leading-relaxed text-faint">
                        Media anexada no Creative Studio.
                        <br />Sem media, a plataforma recusa o anuncio.
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-[10px] uppercase text-faint">
                          {destinationUrl ? new URL(destinationUrl || 'https://exemplo.com').hostname : 'exemplo.com'}
                        </span>
                        <span className="block truncate text-[11px] font-semibold">
                          {headline || 'Titulo do anuncio'}
                        </span>
                        {description ? (
                          <span className="block truncate text-[10px] text-faint">{description}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 rounded-md bg-raised px-2 py-1 text-[10px] font-medium">
                        {capability?.ads.callsToAction.find((c) => c.value === cta)?.label ?? 'Saber mais'}
                      </span>
                    </div>
                  </div>

                  <p className="mt-3 flex items-start gap-1 text-[10px] leading-relaxed text-faint">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    Aproximacao do aspeto no feed. O resultado final depende do posicionamento e do
                    dispositivo de quem ve.
                  </p>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle className="flex items-center gap-1.5">
                      <Wallet className="h-4 w-4" aria-hidden /> Resumo financeiro
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardBody className="space-y-2 text-xs">
                  <SummaryRow label="Conta" value={selectedAccount?.name ?? '—'} />
                  <SummaryRow label="Moeda" value={currency} />
                  <SummaryRow
                    label={budgetKind === 'daily' ? 'Por dia' : 'Total'}
                    value={formatMoney(Number(budget) || 0, currency)}
                  />
                  {budgetKind === 'daily' ? (
                    <SummaryRow
                      label={estimate.days ? `Estimativa (${estimate.days} dias)` : 'Estimativa (30 dias)'}
                      value={formatMoney(estimate.total, currency)}
                    />
                  ) : null}
                  <SummaryRow label="Objetivo" value={selectedObjective?.label ?? '—'} />

                  <Alert tone="warning" className="mt-3">
                    Guardar cria a campanha apenas no NojAds. Nada e enviado a plataforma nem
                    cobrado ate carregar em Publicar no ecra seguinte — e mesmo entao a campanha
                    fica EM PAUSA.
                  </Alert>
                </CardBody>
              </Card>

              {capability?.ads.notes.length ? (
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
          </div>

          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <Field label="Nome da campanha" required className="min-w-[260px] flex-1"
                error={fieldError(state, 'name')}>
                <Input name="name" required maxLength={120}
                  placeholder="Ex.: Promocao de Janeiro — Trafego" />
              </Field>
              <SubmitButton className="mt-5">Guardar campanha (rascunho)</SubmitButton>
            </CardBody>
          </Card>
        </>
      )}
    </ActionForm>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-faint">{label}</span>
      <span className="truncate font-medium text-ink">{value}</span>
    </div>
  );
}
