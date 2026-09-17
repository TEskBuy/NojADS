import type { Metadata } from 'next';
import { Settings, KeyRound, Cpu, Server, ShieldCheck } from 'lucide-react';
import { requireSession } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { ALL_PLATFORMS, capabilitiesFor } from '@/server/platform/capabilities';
import { socialProviderFor } from '@/server/providers/social';
import { aiProvider } from '@/server/providers/ai';
import { paymentProvider } from '@/server/providers/payment';
import { videoProvider } from '@/server/providers/video';
import { ProfileForm } from '@/components/forms/profile-form';
import { updateProfileAction } from '@/server/actions/profile';
import {
  Alert, Badge, Card, CardBody, CardHeader, CardTitle, PageHeader, Table, Td, Th,
} from '@/components/ui';
import { PlatformChip } from '@/components/ui/platform';
import type { IntegrationSetting } from '@/types/models';

export const metadata: Metadata = { title: 'Definicoes' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await requireSession('consulta de definicoes');
  const env = serverEnv();
  const db = createAdminSupabase();

  const { data: integrationRows } = await db.from('integration_settings').select('*').order('provider');
  const integrations = (integrationRows ?? []) as IntegrationSetting[];

  const ai = aiProvider();
  const payments = paymentProvider();
  const video = videoProvider();

  const runtime = [
    { name: 'Supabase', ok: Boolean(env.supabaseUrl && env.supabaseServiceRoleKey),
      missing: ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] },
    { name: 'Cofre de tokens', ok: Boolean(env.tokenEncryptionKey),
      missing: ['TOKEN_ENCRYPTION_KEY'] },
    { name: 'Segredo do cron', ok: Boolean(env.cronSecret), missing: ['CRON_SECRET'] },
    { name: 'Provider de IA', ok: ai.isConfigured(), missing: ai.missingConfiguration() },
    { name: 'Gateway de pagamento', ok: payments.isConfigured(), missing: payments.missingConfiguration() },
    { name: 'Renderizacao de video', ok: video.isConfigured(), missing: video.missingConfiguration() },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Definicoes"
        description="Perfil, integracoes e estado real desta instalacao."
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Settings className="h-4 w-4" aria-hidden /> Perfil
              </CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <ProfileForm action={updateProfileAction} profile={session.profile} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Server className="h-4 w-4" aria-hidden /> Estado desta instalacao
              </CardTitle>
              <p className="mt-1 text-xs text-muted">
                O que esta realmente configurado. Nada e dado como pronto sem as variaveis presentes.
              </p>
            </div>
          </CardHeader>
          <CardBody className="space-y-2">
            {runtime.map((item) => (
              <div key={item.name} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium">{item.name}</p>
                  {!item.ok && item.missing.length > 0 ? (
                    <p className="mt-0.5 font-mono text-[10px] leading-relaxed text-warn">
                      {item.missing.join(', ')}
                    </p>
                  ) : null}
                </div>
                <Badge tone={item.ok ? 'ok' : 'warn'}>
                  {item.ok ? 'Configurado' : 'Por configurar'}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" aria-hidden /> Integracoes por plataforma
            </CardTitle>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Uma integracao so conta como configurada quando as variaveis de ambiente existem
              nesta instalacao. Os passos que exigem criar aplicacoes e pedir aprovacao nas
              plataformas estao em <span className="font-mono">docs/oauth.md</span>.
            </p>
          </div>
        </CardHeader>
        <CardBody>
          <Table className="min-w-[760px]">
            <thead>
              <tr>
                <Th>Plataforma</Th>
                <Th>Conector NojAds</Th>
                <Th>Credenciais</Th>
                <Th>Variaveis necessarias</Th>
                <Th>Versao da API</Th>
              </tr>
            </thead>
            <tbody>
              {ALL_PLATFORMS.map((platform) => {
                const capability = capabilitiesFor(platform);
                const provider = socialProviderFor(platform);
                const configured = provider.isConfigured();
                const record = integrations.find((i) =>
                  i.provider === (platform === 'INSTAGRAM' || platform === 'FACEBOOK' ? 'META' : platform));

                return (
                  <tr key={platform}>
                    <Td><PlatformChip platform={platform} /></Td>
                    <Td>
                      <Badge tone={capability.connectorStatus === 'IMPLEMENTED' ? 'ok' : 'warn'}>
                        {capability.connectorStatus === 'IMPLEMENTED' ? 'Implementado' : 'Estrutura pronta'}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={configured ? 'ok' : 'neutral'}>
                        {configured ? 'Presentes' : 'Em falta'}
                      </Badge>
                    </Td>
                    <Td className="font-mono text-[10px] text-muted">
                      {capability.envKeys.join(', ')}
                    </Td>
                    <Td className="text-xs text-muted">{record?.api_version ?? '—'}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <Cpu className="h-4 w-4" aria-hidden /> Inteligencia artificial
              </CardTitle>
            </div>
          </CardHeader>
          <CardBody className="space-y-3 text-xs">
            <p className="text-muted">
              Provider atual: <span className="font-mono">{ai.name}</span>
            </p>
            {!ai.isConfigured() ? (
              <Alert tone="warning" title="IA nao configurada">
                Sem provider de IA, as tarefas de geracao de conteudo falham com uma mensagem
                clara em vez de produzirem texto inventado. Defina{' '}
                <span className="font-mono">AI_PROVIDER</span> e a chave correspondente.
              </Alert>
            ) : (
              <Alert tone="success" title="IA ativa">
                Cada geracao recebe o cliente, a marca, o publico, a plataforma, o historico
                recente e as metricas — e fica registada em Logs &gt; AI.
              </Alert>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Seguranca financeira
              </CardTitle>
            </div>
          </CardHeader>
          <CardBody className="space-y-2 text-xs leading-relaxed text-muted">
            <p>• Dados de cartao nunca sao guardados. So tokens do gateway e os ultimos 4 digitos.</p>
            <p>• Cada cobranca exige confirmacao explicita de uma pessoa e uma chave de idempotencia.</p>
            <p>• Gasto publicitario, taxa NojAds e taxa do gateway sao colunas separadas, com uma
              restricao na base de dados a garantir que o total corresponde a soma.</p>
            <p>• A automacao nao aumenta orcamentos alem do limite definido por cliente
              (por omissao: 0%, ou seja, apenas propoe).</p>
            <p>• Os limites de gasto por cliente configuram-se em Billing &amp; Pagamentos.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
