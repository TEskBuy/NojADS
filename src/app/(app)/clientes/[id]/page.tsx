import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft, Share2, Wallet, ListChecks, FileText, Megaphone, Palette,
} from 'lucide-react';
import { requireClientAccess } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { updateBrandAction, updateClientAction } from '@/server/actions/clients';
import { ClientForm } from '@/components/forms/client-form';
import { BrandForm } from '@/components/forms/brand-form';
import {
  Card, CardBody, CardHeader, CardTitle, DemoBadge, LinkButton, PageHeader, StatTile,
} from '@/components/ui';
import type { BrandSettings, Client } from '@/types/models';

export const metadata: Metadata = { title: 'Cliente' };
export const dynamic = 'force-dynamic';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireClientAccess(id, 'consulta de cliente');

  const db = createAdminSupabase();
  const { data: clientRow } = await db.from('clients').select('*').eq('id', id).maybeSingle();
  if (!clientRow) notFound();
  const client = clientRow as Client;

  const [brandRes, socialRes, adRes, taskRes, contentRes, campaignRes] = await Promise.all([
    db.from('brand_settings').select('*').eq('client_id', id).maybeSingle(),
    db.from('social_accounts').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('status', 'CONNECTED'),
    db.from('ad_accounts').select('id', { count: 'exact', head: true }).eq('client_id', id),
    db.from('tasks').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('status', 'ACTIVE'),
    db.from('content').select('id', { count: 'exact', head: true }).eq('client_id', id),
    db.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('client_id', id),
  ]);

  const brand = (brandRes.data as BrandSettings | null) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={client.name}
        description={client.description ?? 'Sem descricao. Preencha-a: a IA usa este texto em todas as geracoes.'}
        breadcrumb={
          <Link href="/clientes" className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Clientes
          </Link>
        }
        actions={
          <>
            {client.is_demo ? <DemoBadge /> : null}
            <LinkButton href={`/tarefas/nova?client=${id}`} variant="primary" icon={ListChecks}>Nova tarefa</LinkButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Link href="/redes-sociais"><StatTile label="Redes conectadas" value={socialRes.count ?? 0} icon={Share2} /></Link>
        <Link href="/contas-publicitarias"><StatTile label="Contas publicitarias" value={adRes.count ?? 0} icon={Wallet} /></Link>
        <Link href="/tarefas"><StatTile label="Tarefas ativas" value={taskRes.count ?? 0} icon={ListChecks} /></Link>
        <Link href="/conteudo"><StatTile label="Conteudos" value={contentRes.count ?? 0} icon={FileText} /></Link>
        <Link href="/ads"><StatTile label="Campanhas" value={campaignRes.count ?? 0} icon={Megaphone} /></Link>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-ink">Dados do cliente</h2>
          <ClientForm action={updateClientAction} client={client} submitLabel="Guardar alteracoes" />
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Palette className="h-4 w-4 text-brand" aria-hidden />
            <h2 className="text-sm font-semibold text-ink">Identidade da marca</h2>
          </div>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Como a IA fala por este cliente</CardTitle>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Tudo o que preencher aqui entra no contexto de cada geracao: tom de voz,
                  palavras proibidas, posicionamento e chamadas para acao.
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <BrandForm action={updateBrandAction} clientId={id} brand={brand} />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
