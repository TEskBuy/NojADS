import type { Metadata } from 'next';
import Link from 'next/link';
import { Share2, Plug, RefreshCw, Unplug, AlertTriangle } from 'lucide-react';
import { requireStaff, accessibleClientIds } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { ALL_PLATFORMS, capabilitiesFor } from '@/server/platform/capabilities';
import { socialProviderFor } from '@/server/providers/social';
import { disconnectAccountAction, verifyAccountAction } from '@/server/actions/accounts';
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, DemoBadge, EmptyState,
  LinkButton, PageHeader,
} from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { ConnectionStatusBadge } from '@/components/ui/status';
import { PlatformIcon, SupportPill } from '@/components/ui/platform';
import { formatDateTime, relativeTime } from '@/lib/utils';
import type { Client, SocialAccount } from '@/types/models';

export const metadata: Metadata = { title: 'Redes Sociais' };
export const dynamic = 'force-dynamic';

export default async function SocialAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ sucesso?: string; erro?: string; client?: string }>;
}) {
  const session = await requireStaff('gestao de redes sociais');
  const params = await searchParams;
  const db = createAdminSupabase();
  const ids = await accessibleClientIds(session);

  let clientsQuery = db.from('clients').select('*').neq('status', 'ARCHIVED').order('name');
  if (ids !== null) clientsQuery = clientsQuery.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  const { data: clientRows } = await clientsQuery;
  const clients = (clientRows ?? []) as Client[];

  let accountsQuery = db.from('social_accounts').select('*').order('connected_at', { ascending: false });
  if (ids !== null) accountsQuery = accountsQuery.in('client_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  const { data: accountRows } = await accountsQuery;
  const accounts = (accountRows ?? []) as SocialAccount[];

  const selectedClient = params.client ?? clients[0]?.id;
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Redes Sociais"
        description="A ligacao usa sempre o OAuth oficial de cada plataforma. O NojAds nunca pede nem guarda a palavra-passe da rede social."
      />

      {params.sucesso ? <Alert tone="success" title="Ligacao concluida">{params.sucesso}</Alert> : null}
      {params.erro ? <Alert tone="error" title="A ligacao nao foi concluida">{params.erro}</Alert> : null}

      {clients.length === 0 ? (
        <Card>
          <EmptyState
            icon={Share2}
            title="Crie um cliente primeiro"
            description="As contas sociais pertencem sempre a um cliente. Comece por criar um."
            action={<LinkButton href="/clientes/novo" variant="primary" size="sm">Criar cliente</LinkButton>}
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Ligar uma nova conta</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  Escolha o cliente e a plataforma. E aberta a pagina oficial de autorizacao.
                </p>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <form method="get" className="flex flex-wrap items-end gap-3">
                <label className="flex-1 min-w-[200px]">
                  <span className="mb-1.5 block text-xs font-medium">Cliente</span>
                  <select
                    name="client" defaultValue={selectedClient}
                    className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}{c.is_demo ? ' (DEMO)' : ''}</option>
                    ))}
                  </select>
                </label>
                <button type="submit" className="h-9 rounded-lg border border-line px-4 text-sm hover:bg-raised">
                  Selecionar
                </button>
              </form>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {ALL_PLATFORMS.map((platform) => {
                  const capabilities = capabilitiesFor(platform);
                  const provider = socialProviderFor(platform);
                  const configured = provider.isConfigured();
                  const buildable = capabilities.social.support === 'SUPPORTED';
                  const slug = platform === 'FACEBOOK' || platform === 'INSTAGRAM'
                    ? 'meta' : platform.toLowerCase();

                  return (
                    <div key={platform} className="rounded-lg border border-line p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={platform} className="h-5 w-5" />
                          <span className="text-sm font-medium">{capabilities.label}</span>
                        </div>
                        <SupportPill support={capabilities.social.support} />
                      </div>

                      {!buildable ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-warn">
                          {capabilities.social.notes[0]?.text}
                        </p>
                      ) : !configured ? (
                        <p className="mt-2 text-[11px] leading-relaxed text-warn">
                          Integracao nao configurada nesta instalacao. Faltam:{' '}
                          <span className="font-mono">{provider.missingConfiguration().join(', ')}</span>.
                          Veja <span className="font-mono">docs/oauth.md</span>.
                        </p>
                      ) : (
                        <p className="mt-2 text-[11px] leading-relaxed text-muted">
                          Permissoes pedidas: {capabilities.social.requiredScopes.slice(0, 3).join(', ')}…
                        </p>
                      )}

                      <div className="mt-3">
                        {buildable && configured && selectedClient ? (
                          <LinkButton
                            href={`/api/oauth/${slug}/start?client=${selectedClient}`}
                            variant="primary" size="sm" icon={Plug}
                          >
                            Ligar {capabilities.label}
                          </LinkButton>
                        ) : (
                          <span className="text-[11px] text-faint">Indisponivel</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div><CardTitle>Contas ligadas</CardTitle></div>
              <Badge tone="neutral">{String(accounts.length)}</Badge>
            </CardHeader>
            {accounts.length === 0 ? (
              <EmptyState
                icon={Share2}
                title="Nenhuma conta ligada"
                description="Ligue a primeira conta acima. Sem contas ligadas, nada pode ser publicado."
              />
            ) : (
              <ul className="divide-y divide-line">
                {accounts.map((account) => (
                  <li key={account.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                    <PlatformIcon platform={account.platform} className="mt-0.5 h-5 w-5" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {account.display_name ?? account.username ?? account.external_id}
                        {account.is_demo ? <DemoBadge /> : null}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {clientName.get(account.client_id) ?? '—'}
                        {account.account_type ? ` · ${account.account_type}` : ''}
                        {' · '}Ligada {relativeTime(account.connected_at)}
                      </p>
                      {account.status_reason ? (
                        <p className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-warn">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                          {account.status_reason}
                        </p>
                      ) : null}
                      {account.last_checked_at ? (
                        <p className="mt-0.5 text-[10px] text-faint">
                          Verificada em {formatDateTime(account.last_checked_at)}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-start gap-2">
                      <ConnectionStatusBadge status={account.status} />
                      <ActionButton
                        size="sm" icon={RefreshCw}
                        action={verifyAccountAction.bind(null, account.id)}
                      >
                        Verificar
                      </ActionButton>
                      <ActionButton
                        size="sm" variant="danger" icon={Unplug}
                        confirm={
                          `Desconectar ${account.display_name ?? 'esta conta'}?\n\n` +
                          'As tarefas que dependem dela serao pausadas. O historico de publicacoes ' +
                          'e mantido. Pode voltar a ligar depois.'
                        }
                        action={disconnectAccountAction.bind(null, account.id)}
                      >
                        Desconectar
                      </ActionButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>O que cada plataforma permite</CardTitle>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Estes limites vem das APIs oficiais, nao de escolhas do NojAds. O que aparece
                  como indisponivel nao e simulado em lado nenhum do produto.
                </p>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              {ALL_PLATFORMS.map((platform) => {
                const capabilities = capabilitiesFor(platform);
                if (capabilities.social.notes.length === 0) return null;
                return (
                  <div key={platform} className="rounded-lg border border-line p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold">
                      <PlatformIcon platform={platform} />
                      {capabilities.label}
                      <Link href={capabilities.docsUrl} target="_blank" rel="noreferrer"
                        className="text-[10px] font-normal text-brand hover:underline">
                        documentacao oficial
                      </Link>
                    </p>
                    <ul className="mt-2 space-y-1">
                      {capabilities.social.notes.map((note, i) => (
                        <li key={i} className={`text-[11px] leading-relaxed ${note.level === 'WARNING' ? 'text-warn' : 'text-muted'}`}>
                          • {note.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
