import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, ListChecks, Play, Pause, Zap } from 'lucide-react';
import { requireStaff } from '@/server/auth/session';
import { listTasks, loadTaskFormData } from '@/server/repositories/tasks';
import { taskTypeDefinition } from '@/server/tasks/types';
import { describeSchedule, specFromTask } from '@/server/tasks/schedule';
import { activateTaskAction, pauseTaskAction, runTaskNowAction } from '@/server/actions/tasks';
import {
  Alert, Badge, Card, DemoBadge, EmptyState, LinkButton, PageHeader, Table, Td, Th,
} from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { TaskStatusBadge } from '@/components/ui/status';
import { PlatformChip } from '@/components/ui/platform';
import { formatDateTime, relativeTime } from '@/lib/utils';

export const metadata: Metadata = { title: 'Tarefas' };
export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string }>;
}) {
  const session = await requireStaff('gestao de tarefas');
  const params = await searchParams;
  const [tasks, { clients }] = await Promise.all([
    listTasks(session, params),
    loadTaskFormData(session),
  ]);
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const active = tasks.filter((t) => t.status === 'ACTIVE').length;
  const errored = tasks.filter((t) => t.status === 'ERROR').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarefas"
        description="Configure uma vez e o NojAds executa continuamente ate pausar, alterar ou remover."
        actions={<LinkButton href="/tarefas/nova" variant="primary" icon={Plus}>Nova tarefa</LinkButton>}
      />

      {errored > 0 ? (
        <Alert tone="error" title={`${errored} tarefa(s) em estado de erro`}>
          Uma tarefa que falha 5 vezes seguidas e parada automaticamente para nao falhar em silencio.
          Abra cada uma para ver o motivo exato e retome-a depois de corrigir.
        </Alert>
      ) : null}

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-3">
          <select name="client" defaultValue={params.client ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" aria-label="Cliente">
            <option value="">Todos os clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select name="status" defaultValue={params.status ?? ''}
            className="h-9 rounded-lg border border-line bg-surface px-3 text-sm" aria-label="Estado">
            <option value="">Todas exceto removidas</option>
            <option value="ACTIVE">Ativas</option>
            <option value="PAUSED">Pausadas</option>
            <option value="ERROR">Com erro</option>
            <option value="DISABLED">Desativadas</option>
            <option value="REMOVED">Removidas</option>
          </select>
          <button type="submit" className="h-9 rounded-lg border border-line px-4 text-sm hover:bg-raised">
            Filtrar
          </button>
          <span className="ml-auto text-xs text-muted">
            {active} ativa(s) de {tasks.length}
          </span>
        </form>

        {tasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Ainda nao ha tarefas"
            description="Uma tarefa e uma instrucao recorrente: criar 3 Reels por dia, publicar as 09:00, sincronizar metricas todas as manhas."
            action={<LinkButton href="/tarefas/nova" variant="primary" size="sm">Criar a primeira tarefa</LinkButton>}
          />
        ) : (
          <Table className="min-w-[900px]">
            <thead>
              <tr>
                <Th>Tarefa</Th>
                <Th>Agendamento</Th>
                <Th>Proxima</Th>
                <Th>Ultima</Th>
                <Th>Execucoes</Th>
                <Th>Estado</Th>
                <Th>Accoes</Th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const definition = taskTypeDefinition(task.type);
                return (
                  <tr key={task.id} className="hover:bg-raised/50">
                    <Td>
                      <Link href={`/tarefas/${task.id}`} className="font-medium text-ink hover:text-brand">
                        {task.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                        <span>{clientName.get(task.client_id) ?? '—'}</span>
                        {task.platform ? <PlatformChip platform={task.platform} /> : null}
                        <span>{definition?.label ?? task.type}</span>
                        <Badge tone={task.mode === 'AUTOMATIC' ? 'info' : 'warn'}>
                          {task.mode === 'AUTOMATIC' ? 'Automatico' : 'Aprovacao'}
                        </Badge>
                        {task.is_demo ? <DemoBadge /> : null}
                      </div>
                    </Td>
                    <Td className="text-xs text-muted">
                      {describeSchedule(specFromTask(task))}
                      <span className="mt-0.5 block text-[10px] text-faint">{task.timezone}</span>
                    </Td>
                    <Td className="text-xs tabular-nums">
                      {task.next_run_at ? (
                        <>
                          <span className="block">{relativeTime(task.next_run_at)}</span>
                          <span className="block text-[10px] text-faint">
                            {formatDateTime(task.next_run_at, task.timezone)}
                          </span>
                        </>
                      ) : <span className="text-faint">—</span>}
                    </Td>
                    <Td className="text-xs tabular-nums text-muted">
                      {task.last_run_at ? relativeTime(task.last_run_at) : '—'}
                    </Td>
                    <Td className="text-xs tabular-nums">
                      <span className="text-ink">{task.run_count}</span>
                      {task.failure_count > 0 ? (
                        <span className="ml-1 text-danger">({task.failure_count} falha(s))</span>
                      ) : null}
                    </Td>
                    <Td><TaskStatusBadge status={task.status} /></Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {task.status === 'ACTIVE' ? (
                          <ActionButton size="sm" icon={Pause} action={pauseTaskAction.bind(null, task.id)}>
                            Pausar
                          </ActionButton>
                        ) : task.status !== 'REMOVED' ? (
                          <ActionButton size="sm" variant="primary" icon={Play}
                            action={activateTaskAction.bind(null, task.id)}>
                            Ativar
                          </ActionButton>
                        ) : null}
                        {task.status !== 'REMOVED' ? (
                          <ActionButton size="sm" icon={Zap} action={runTaskNowAction.bind(null, task.id)}>
                            Executar agora
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
    </div>
  );
}
