import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Play, Pause, Zap, Trash2 } from 'lucide-react';
import { requireClientAccess } from '@/server/auth/session';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { loadTaskFormData, loadTaskRuns } from '@/server/repositories/tasks';
import { TASK_TYPES, taskTypeDefinition } from '@/server/tasks/types';
import { describeSchedule, specFromTask } from '@/server/tasks/schedule';
import {
  activateTaskAction, pauseTaskAction, removeTaskAction, runTaskNowAction, updateTaskAction,
} from '@/server/actions/tasks';
import { TaskForm } from '@/components/forms/task-form';
import {
  Alert, Card, CardBody, CardHeader, CardTitle, EmptyState, PageHeader, StatTile,
} from '@/components/ui';
import { ActionButton } from '@/components/ui/action-button';
import { RunStatusBadge, TaskStatusBadge } from '@/components/ui/status';
import { formatDateTime, relativeTime } from '@/lib/utils';
import type { AppErrorShape } from '@/lib/errors';
import type { Task } from '@/types/models';

export const metadata: Metadata = { title: 'Tarefa' };
export const dynamic = 'force-dynamic';

export default async function TaskDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criada?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const db = createAdminSupabase();
  const { data: taskRow } = await db.from('tasks').select('*').eq('id', id).maybeSingle();
  if (!taskRow) notFound();
  const task = taskRow as Task;

  const { session } = await requireClientAccess(task.client_id, 'consulta de tarefa');
  const [runs, formData] = await Promise.all([loadTaskRuns(id), loadTaskFormData(session)]);
  const definition = taskTypeDefinition(task.type);
  const lastError = task.last_error as AppErrorShape | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={task.name}
        description={definition?.description}
        breadcrumb={
          <Link href="/tarefas" className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-brand">
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden /> Tarefas
          </Link>
        }
        actions={
          <>
            <TaskStatusBadge status={task.status} />
            {task.status === 'ACTIVE' ? (
              <ActionButton icon={Pause} action={pauseTaskAction.bind(null, task.id)}>Pausar</ActionButton>
            ) : task.status !== 'REMOVED' ? (
              <ActionButton variant="primary" icon={Play} action={activateTaskAction.bind(null, task.id)}>
                Ativar
              </ActionButton>
            ) : null}
            {task.status !== 'REMOVED' ? (
              <>
                <ActionButton icon={Zap} action={runTaskNowAction.bind(null, task.id)}>
                  Executar agora
                </ActionButton>
                <ActionButton
                  variant="danger" icon={Trash2}
                  confirm={
                    'Remover esta tarefa?\n\n' +
                    'As execucoes futuras sao canceladas. Todo o historico, conteudos, campanhas e ' +
                    'logs produzidos por ela sao preservados. As outras tarefas continuam normalmente.\n\n' +
                    'Esta accao nao pode ser desfeita.'
                  }
                  action={removeTaskAction.bind(null, task.id)}
                >
                  Remover
                </ActionButton>
              </>
            ) : null}
          </>
        }
      />

      {query.criada ? (
        <Alert tone="success" title="Tarefa criada em pausa">
          Reveja o agendamento abaixo e clique em Ativar quando estiver pronto. Nada corre ate la.
        </Alert>
      ) : null}

      {task.status === 'REMOVED' ? (
        <Alert tone="warning" title="Esta tarefa foi removida">
          Removida em {formatDateTime(task.removed_at)}. O historico abaixo continua disponivel
          e nao sera apagado.
        </Alert>
      ) : null}

      {lastError ? (
        <Alert tone="error" title="Ultima falha registada">
          <p><strong>{lastError.operation}</strong> — {lastError.step}: {lastError.message}</p>
          {lastError.hint ? <p className="mt-1">Solucao: {lastError.hint}</p> : null}
          <p className="mt-1 font-mono text-[10px] opacity-70">Codigo: {lastError.code}</p>
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Execucoes" value={task.run_count} />
        <StatTile label="Falhas" value={task.failure_count}
          tone={task.failure_count > 0 ? 'danger' : 'neutral'} />
        <StatTile label="Proxima execucao"
          value={task.next_run_at ? relativeTime(task.next_run_at) : '—'}
          hint={task.next_run_at ? formatDateTime(task.next_run_at, task.timezone) : 'A tarefa nao esta ativa.'} />
        <StatTile label="Agendamento" value={<span className="text-sm">{describeSchedule(specFromTask(task))}</span>}
          hint={task.timezone} />
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Historico de execucoes</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Preservado mesmo que a tarefa seja removida.
            </p>
          </div>
        </CardHeader>
        {runs.length === 0 ? (
          <EmptyState icon={Zap} title="Ainda nao executou"
            description="Ative a tarefa ou use Executar agora para a correr imediatamente." />
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((run) => {
              const error = run.error as AppErrorShape | null;
              const output = run.output as Record<string, unknown>;
              return (
                <li key={run.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <RunStatusBadge status={run.status} />
                    <span className="text-xs text-muted">
                      {run.trigger === 'MANUAL' ? 'Manual' : run.trigger === 'RETRY' ? 'Retentativa' : 'Agendada'}
                    </span>
                    <span className="text-xs text-faint">{formatDateTime(run.created_at, task.timezone)}</span>
                    {run.duration_ms ? (
                      <span className="text-xs tabular-nums text-faint">{(run.duration_ms / 1000).toFixed(1)}s</span>
                    ) : null}
                    {run.attempt > 1 ? (
                      <span className="text-xs text-warn">tentativa {run.attempt}</span>
                    ) : null}
                  </div>
                  {error ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-danger">
                      {error.operation} — {error.step}: {error.message}
                      {error.hint ? <span className="block opacity-80">Solucao: {error.hint}</span> : null}
                    </p>
                  ) : Object.keys(output ?? {}).length > 0 ? (
                    <p className="mt-1 font-mono text-[10px] leading-relaxed text-muted">
                      {JSON.stringify(output).slice(0, 240)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {task.status !== 'REMOVED' ? (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Editar tarefa</h2>
          <TaskForm
            action={updateTaskAction}
            clients={formData.clients}
            socialAccounts={formData.socialAccounts}
            adAccounts={formData.adAccounts}
            taskTypes={Object.values(TASK_TYPES)}
            task={task}
            submitLabel="Guardar alteracoes"
          />
        </div>
      ) : (
        <Card>
          <CardHeader><div><CardTitle>Configuracao arquivada</CardTitle></div></CardHeader>
          <CardBody>
            <pre className="overflow-x-auto rounded-lg bg-raised p-3 font-mono text-[10px] leading-relaxed text-muted">
              {JSON.stringify({
                type: task.type, frequency: task.frequency, timezone: task.timezone,
                run_at_times: task.run_at_times, weekdays: task.weekdays,
                quantity: task.quantity, mode: task.mode, config: task.config,
              }, null, 2)}
            </pre>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
