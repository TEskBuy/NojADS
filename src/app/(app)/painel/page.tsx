import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Users, Share2, Wallet, ListChecks, FileText, Megaphone, AlertTriangle,
  CheckCircle2, Clock, TrendingUp, Send, ShieldQuestion,
} from 'lucide-react';
import { requireSession } from '@/server/auth/session';
import { loadDashboard } from '@/server/repositories/dashboard';
import {
  Alert, Badge, Card, CardHeader, CardTitle, DemoBadge, EmptyState,
  LinkButton, PageHeader, StatTile,
} from '@/components/ui';
import { ContentStatusBadge, RunStatusBadge, TaskStatusBadge } from '@/components/ui/status';
import { PlatformChip } from '@/components/ui/platform';
import { formatDateTime, formatMoney, formatNumber, relativeTime, truncate } from '@/lib/utils';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await requireSession('acesso ao dashboard');
  const data = await loadDashboard(session);
  const { counts } = data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Bom trabalho, ${session.profile.full_name?.split(' ')[0] ?? 'equipa'}`}
        description="Estado geral da operacao: o que esta a correr, o que vem a seguir e o que precisa de si."
        actions={<LinkButton href="/tarefas/nova" variant="primary" icon={ListChecks}>Nova tarefa</LinkButton>}
      />

      {data.hasDemoData ? (
        <Alert tone="warning" title="Esta instalacao contem dados DEMO">
          Existem clientes marcados como DEMO. Sao dados ficticios, nunca reais, e estao
          sempre identificados com a etiqueta DEMO. Remova-os com <code>npm run seed:clean</code> antes
          de usar em producao.
        </Alert>
      ) : null}

      {counts.pendingApprovals > 0 ? (
        <Alert tone="warning" title={`${counts.pendingApprovals} item(ns) a aguardar a sua aprovacao`}>
          Nada e publicado nem cobrado enquanto aguarda decisao.{' '}
          <Link href="/conteudo?status=PENDING_APPROVAL" className="font-medium underline">Rever agora</Link>
        </Alert>
      ) : null}

      {counts.failedRunsToday > 0 ? (
        <Alert tone="error" title={`${counts.failedRunsToday} execucao(oes) falharam hoje`}>
          Consulte <Link href="/logs" className="font-medium underline">Logs</Link> para o motivo exato de cada falha.
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Clientes" value={formatNumber(counts.clients)} icon={Users} />
        <StatTile label="Contas sociais" value={formatNumber(counts.socialAccounts)} icon={Share2}
          hint="Conectadas e ativas" />
        <StatTile label="Contas publicitarias" value={formatNumber(counts.adAccounts)} icon={Wallet} />
        <StatTile label="Tarefas ativas" value={formatNumber(counts.activeTasks)} icon={ListChecks}
          tone={counts.activeTasks > 0 ? 'ok' : 'neutral'} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Executadas hoje" value={formatNumber(counts.runsToday)} icon={Clock} />
        <StatTile label="Publicadas hoje" value={formatNumber(counts.publishedToday)} icon={Send}
          tone={counts.publishedToday > 0 ? 'ok' : 'neutral'} />
        <StatTile label="Campanhas ativas" value={formatNumber(counts.campaignsActive)} icon={Megaphone} />
        <StatTile label="Investimento hoje" value={formatMoney(data.spend.total, data.spend.currency)}
          icon={TrendingUp} hint="Somatorio das metricas sincronizadas" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Proximas execucoes</CardTitle>
              <p className="mt-1 text-xs text-muted">Tarefas ativas ordenadas pela proxima execucao.</p>
            </div>
            <LinkButton href="/tarefas" size="sm">Ver todas</LinkButton>
          </CardHeader>
          {data.upcomingTasks.length === 0 ? (
            <EmptyState
              icon={ListChecks}
              title="Nenhuma tarefa agendada"
              description="Crie uma tarefa recorrente e o NojAds passa a trabalhar sozinho ate a pausar."
              action={<LinkButton href="/tarefas/nova" variant="primary" size="sm">Criar tarefa</LinkButton>}
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.upcomingTasks.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/tarefas/${task.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand">
                      {task.name}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                      {task.client_name ? <span>{task.client_name}</span> : null}
                      {task.platform ? <PlatformChip platform={task.platform} /> : null}
                      {task.is_demo ? <DemoBadge /> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium tabular-nums text-ink">{relativeTime(task.next_run_at)}</p>
                    <p className="text-[10px] text-faint">{formatDateTime(task.next_run_at, task.timezone)}</p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Proximas publicacoes</CardTitle>
              <p className="mt-1 text-xs text-muted">Conteudo agendado ou a aguardar aprovacao.</p>
            </div>
            <LinkButton href="/calendario" size="sm">Calendario</LinkButton>
          </CardHeader>
          {data.upcomingContent.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nada agendado"
              description="Assim que uma tarefa de conteudo executar, as publicacoes aparecem aqui."
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.upcomingContent.map((content) => (
                <li key={content.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/conteudo/${content.id}`} className="block text-sm text-ink hover:text-brand">
                      {truncate(content.title ?? content.body, 70)}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      <PlatformChip platform={content.platform} />
                      <span>{content.format}</span>
                      <span>{formatDateTime(content.scheduled_for, content.timezone)}</span>
                    </p>
                  </div>
                  <ContentStatusBadge status={content.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div><CardTitle>Execucoes recentes</CardTitle></div>
          </CardHeader>
          {data.recentRuns.length === 0 ? (
            <EmptyState icon={Clock} title="Sem execucoes" description="O historico aparece aqui a medida que as tarefas correm." />
          ) : (
            <ul className="divide-y divide-line">
              {data.recentRuns.map((run) => (
                <li key={run.id} className="flex items-center gap-3 px-5 py-2.5">
                  {run.status === 'SUCCEEDED'
                    ? <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" aria-hidden />
                    : run.status === 'FAILED'
                      ? <AlertTriangle className="h-4 w-4 shrink-0 text-danger" aria-hidden />
                      : <Clock className="h-4 w-4 shrink-0 text-faint" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink">{run.task_name ?? 'Tarefa'}</p>
                    <p className="text-[10px] text-faint">
                      {run.trigger === 'MANUAL' ? 'Manual' : 'Agendada'} · {relativeTime(run.created_at)}
                      {run.duration_ms ? ` · ${(run.duration_ms / 1000).toFixed(1)}s` : ''}
                    </p>
                  </div>
                  <RunStatusBadge status={run.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <div><CardTitle>Aprovacoes pendentes</CardTitle></div>
            <Badge tone={data.pendingApprovals.length ? 'warn' : 'neutral'}>
              {String(data.pendingApprovals.length)}
            </Badge>
          </CardHeader>
          {data.pendingApprovals.length === 0 ? (
            <EmptyState icon={ShieldQuestion} title="Nada a aprovar"
              description="Quando uma tarefa em modo aprovacao gerar conteudo ou campanha, aparece aqui." />
          ) : (
            <ul className="divide-y divide-line">
              {data.pendingApprovals.map((approval) => (
                <li key={approval.id} className="px-5 py-3">
                  <p className="text-xs font-medium text-ink">{approval.summary}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[10px] text-faint">
                    <Badge tone="warn">{approval.subject}</Badge>
                    {approval.amount
                      ? <span>{formatMoney(Number(approval.amount), approval.currency ?? 'USD')}</span>
                      : null}
                    <span>{relativeTime(approval.created_at)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div><CardTitle>Atividade recente</CardTitle></div>
          <LinkButton href="/logs" size="sm">Ver logs completos</LinkButton>
        </CardHeader>
        {data.recentActivity.length === 0 ? (
          <EmptyState icon={FileText} title="Sem atividade registada"
            description="Todas as accoes do sistema e dos utilizadores ficam registadas aqui." />
        ) : (
          <ul className="divide-y divide-line">
            {data.recentActivity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-2.5">
                <Badge tone={entry.level === 'ERROR' ? 'danger' : entry.level === 'WARN' ? 'warn' : 'neutral'}>
                  {entry.channel}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-ink">{entry.message ?? entry.action}</p>
                  <p className="text-[10px] text-faint">{entry.action} · {relativeTime(entry.created_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
