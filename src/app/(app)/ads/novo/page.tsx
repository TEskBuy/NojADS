import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, Wallet } from 'lucide-react';
import { requireStaff } from '@/server/auth/session';
import { loadTaskFormData } from '@/server/repositories/tasks';
import { PLATFORM_CAPABILITIES } from '@/server/platform/capabilities';
import { createCampaignAction } from '@/server/actions/campaigns';
import { CampaignForm } from '@/components/forms/campaign-form';
import { Alert, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Criar anuncio' };
export const dynamic = 'force-dynamic';

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await requireStaff('criacao de anuncio');
  const params = await searchParams;
  const data = await loadTaskFormData(session);

  if (data.adAccounts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Criar anuncio" />
        <Card>
          <EmptyState
            icon={Wallet}
            title="Nenhuma conta publicitaria disponivel"
            description="Ligue uma conta Meta em Redes Sociais e sincronize as contas publicitarias. Sem uma conta publicitaria real, nao ha onde criar a campanha."
            action={<LinkButton href="/contas-publicitarias" variant="primary" size="sm">Contas publicitarias</LinkButton>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Criar anuncio"
        description="Objetivo, criativo, publico, posicionamentos, orcamento e revisao — tudo dentro do NojAds."
        breadcrumb={
          <Link href="/ads" className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Ads Manager
          </Link>
        }
      />

      <Alert tone="info" title="Duas travoes de seguranca, sempre">
        Guardar cria a campanha apenas no NojAds — nada e enviado nem cobrado. Publicar cria a
        estrutura na plataforma e deixa-a EM PAUSA. So a accao Ativar, feita por si, comeca a
        investir dinheiro real.
      </Alert>

      <CampaignForm
        action={createCampaignAction}
        clients={data.clients}
        adAccounts={data.adAccounts}
        socialAccounts={data.socialAccounts}
        capabilities={PLATFORM_CAPABILITIES}
        defaultClientId={params.client}
      />
    </div>
  );
}
