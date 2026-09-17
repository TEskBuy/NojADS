import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireStaff } from '@/server/auth/session';
import { createClientAction } from '@/server/actions/clients';
import { ClientForm } from '@/components/forms/client-form';
import { Alert, PageHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Novo cliente' };

export default async function NewClientPage() {
  await requireStaff('criacao de cliente');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Novo cliente"
        description="Passo 1 de 10 do fluxo NojAds. Depois: marca, redes sociais, contas publicitarias, billing e tarefas."
        breadcrumb={
          <Link href="/clientes" className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Clientes
          </Link>
        }
      />

      <Alert tone="info" title="O que acontece ao guardar">
        O NojAds cria automaticamente um perfil de marca vazio e um registo de limites de gasto
        com pagamentos automaticos bloqueados. Nada gasta dinheiro sem uma decisao sua.
      </Alert>

      <ClientForm action={createClientAction} submitLabel="Criar cliente" />
    </div>
  );
}
