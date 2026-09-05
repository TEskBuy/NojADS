import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireStaff } from '@/server/auth/session';
import { loadTaskFormData } from '@/server/repositories/tasks';
import { TASK_TYPES } from '@/server/tasks/types';
import { createTaskAction } from '@/server/actions/tasks';
import { TaskForm } from '@/components/forms/task-form';
import { Alert, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { Users } from 'lucide-react';

export const metadata: Metadata = { title: 'Nova tarefa' };
export const dynamic = 'force-dynamic';

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await requireStaff('criacao de tarefa');
  const params = await searchParams;
  const data = await loadTaskFormData(session);

  if (data.clients.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Nova tarefa" />
        <Card>
          <EmptyState
            icon={Users}
            title="Crie um cliente primeiro"
            description="Uma tarefa pertence sempre a um cliente e usa a identidade da marca desse cliente."
            action={<LinkButton href="/clientes/novo" variant="primary" size="sm">Criar cliente</LinkButton>}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nova tarefa"
        description="A tarefa e criada em pausa. Reveja o agendamento e ative-a quando estiver pronto."
        breadcrumb={
          <Link href="/tarefas" className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Tarefas
          </Link>
        }
      />

      <Alert tone="info" title="Como isto funciona">
        O scheduler procura tarefas cuja hora chegou, reserva a execucao (sem nunca duplicar),
        e envia um trabalho para a fila. O worker persistente processa-o e regista o resultado.
        Pausar cancela as execucoes futuras sem apagar nada do historico.
      </Alert>

      <TaskForm
        action={createTaskAction}
        clients={data.clients}
        socialAccounts={data.socialAccounts}
        adAccounts={data.adAccounts}
        taskTypes={Object.values(TASK_TYPES)}
        submitLabel="Criar tarefa"
        defaultClientId={params.client}
      />
    </div>
  );
}
