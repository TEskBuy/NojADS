'use client';
/**
 * Task editor.
 *
 * The type list, the platform list and the available formats all come from the
 * capability registry, so the form cannot offer a combination the platform
 * refuses. The schedule preview calls the same pure function the scheduler
 * uses, so what you see is what will actually run.
 */
import { useMemo, useState, useTransition } from 'react';
import { CalendarClock, Info } from 'lucide-react';
import { ActionForm, SubmitButton, fieldError, type ActionState } from './action-form';
import {
  Alert, Card, CardBody, CardHeader, CardTitle, Field, Input, Select, Textarea,
} from '@/components/ui';
import { previewScheduleAction } from '@/server/actions/tasks';
import { formatDateTime } from '@/lib/utils';
import type { AdAccount, Client, SocialAccount, Task } from '@/types/models';
import type { TaskTypeDefinition } from '@/server/tasks/types';

const WEEKDAYS = [
  { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sab' },
  { value: 7, label: 'Dom' },
];

const FREQUENCIES = [
  { value: 'DAILY', label: 'Todos os dias' },
  { value: 'WEEKLY', label: 'Dias especificos da semana' },
  { value: 'MONTHLY', label: 'Dias especificos do mes' },
  { value: 'HOURLY', label: 'De hora a hora' },
  { value: 'INTERVAL', label: 'A cada N minutos' },
  { value: 'CRON', label: 'Expressao cron' },
  { value: 'ONCE', label: 'Uma unica vez' },
];

const TIMEZONES = [
  'Africa/Luanda', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Maputo',
  'Europe/Lisbon', 'Europe/London', 'America/Sao_Paulo', 'UTC',
];

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TaskForm({
  action, clients, socialAccounts, adAccounts, taskTypes, task, submitLabel, defaultClientId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  clients: Client[];
  socialAccounts: SocialAccount[];
  adAccounts: AdAccount[];
  taskTypes: TaskTypeDefinition[];
  task?: Task;
  submitLabel: string;
  defaultClientId?: string;
}) {
  const [clientId, setClientId] = useState(task?.client_id ?? defaultClientId ?? clients[0]?.id ?? '');
  const [type, setType] = useState(task?.type ?? taskTypes[0]?.id ?? 'GENERATE_POSTS');
  const [frequency, setFrequency] = useState(task?.frequency ?? 'DAILY');
  const [times, setTimes] = useState((task?.run_at_times ?? ['09:00']).join(', '));
  const [weekdays, setWeekdays] = useState<number[]>(task?.weekdays ?? [1]);
  const [monthDays, setMonthDays] = useState((task?.month_days ?? [1]).join(', '));
  const [interval, setInterval] = useState(String(task?.interval_minutes ?? 60));
  const [cron, setCron] = useState(task?.cron_expression ?? '0 9 * * *');
  const [timezone, setTimezone] = useState(
    task?.timezone ?? clients.find((c) => c.id === clientId)?.timezone ?? 'Africa/Luanda',
  );
  const [startsAt, setStartsAt] = useState(toLocalInput(task?.starts_at) || toLocalInput(new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(toLocalInput(task?.ends_at));
  const [preview, setPreview] = useState<{ runs: string[]; message?: string } | null>(null);
  const [previewing, startPreview] = useTransition();

  const definition = useMemo(() => taskTypes.find((t) => t.id === type), [taskTypes, type]);
  const clientAccounts = socialAccounts.filter((a) => a.client_id === clientId && a.status === 'CONNECTED');
  const clientAdAccounts = adAccounts.filter((a) => a.client_id === clientId);

  function runPreview() {
    startPreview(async () => {
      const result = await previewScheduleAction({
        frequency,
        timezone,
        runAtTimes: times.split(',').map((t) => t.trim()).filter(Boolean),
        weekdays,
        monthDays: monthDays.split(',').map((d) => Number(d.trim())).filter(Number.isFinite),
        intervalMinutes: Number(interval) || null,
        cronExpression: cron || null,
        startsAt: new Date(startsAt || Date.now()).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      });
      setPreview({ runs: result.runs, message: result.message });
    });
  }

  return (
    <ActionForm action={action} className="space-y-4">
      {(state) => (
        <>
          {task ? <input type="hidden" name="task_id" value={task.id} /> : null}
          <input type="hidden" name="weekdays" value={weekdays.join(',')} />

          <Card>
            <CardHeader><div><CardTitle>O que esta tarefa faz</CardTitle></div></CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Cliente" required error={fieldError(state, 'client_id')}>
                <Select
                  name="client_id" value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    const client = clients.find((c) => c.id === e.target.value);
                    if (client) setTimezone(client.timezone);
                  }}
                  required
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.is_demo ? ' (DEMO)' : ''}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Tipo de tarefa" required error={fieldError(state, 'type')}>
                <Select name="type" value={type} onChange={(e) => setType(e.target.value)} required>
                  {taskTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </Select>
              </Field>

              {definition ? (
                <div className="sm:col-span-2">
                  <Alert tone="info">
                    <p>{definition.description}</p>
                    <p className="mt-1 text-[11px] opacity-90">
                      Fila: <span className="font-mono">{definition.queue}</span>
                      {definition.requiresAI ? ' · precisa de um provider de IA configurado' : ''}
                      {definition.requiresSocialAccount ? ' · precisa de conta social ligada' : ''}
                      {definition.requiresAdAccount ? ' · precisa de conta publicitaria' : ''}
                      {definition.touchesMoney ? ' · pode envolver dinheiro real (exige aprovacao)' : ''}
                    </p>
                  </Alert>
                </div>
              ) : null}

              <Field label="Nome" required hint='Ex.: "3 Reels por dia — Instagram"'
                error={fieldError(state, 'name')}>
                <Input name="name" defaultValue={task?.name} required maxLength={120} />
              </Field>

              <Field label="Quantidade por execucao" required
                hint={definition ? `Maximo ${definition.maxQuantity}.` : undefined}
                error={fieldError(state, 'quantity')}>
                <Input
                  name="quantity" type="number" min={1} max={definition?.maxQuantity ?? 50}
                  defaultValue={task?.quantity ?? definition?.defaultQuantity ?? 1} required
                />
              </Field>

              <Field label="Descricao" className="sm:col-span-2" error={fieldError(state, 'description')}>
                <Textarea name="description" rows={2} defaultValue={task?.description ?? ''} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Onde e com que conta</CardTitle></div></CardHeader>
            <CardBody className="grid gap-4 sm:grid-cols-2">
              <Field label="Plataforma" error={fieldError(state, 'platform')}>
                <Select name="platform" defaultValue={task?.platform ?? ''}>
                  <option value="">Nao aplicavel</option>
                  {[...new Set(clientAccounts.map((a) => a.platform))].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Conta social"
                hint={clientAccounts.length === 0 ? 'Este cliente ainda nao tem contas ligadas.' : undefined}
                error={fieldError(state, 'social_account_id')}
              >
                <Select name="social_account_id" defaultValue={task?.social_account_id ?? ''}>
                  <option value="">Nenhuma</option>
                  {clientAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.platform} — {a.display_name ?? a.username ?? a.external_id}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Conta publicitaria" className="sm:col-span-2"
                hint={clientAdAccounts.length === 0 ? 'Sem contas publicitarias sincronizadas para este cliente.' : undefined}
                error={fieldError(state, 'ad_account_id')}>
                <Select name="ad_account_id" defaultValue={task?.ad_account_id ?? ''}>
                  <option value="">Nenhuma</option>
                  {clientAdAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name ?? a.external_id} ({a.currency})</option>
                  ))}
                </Select>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Quando executa</CardTitle>
                <p className="mt-1 text-xs text-muted">
                  Os horarios sao sempre interpretados no fuso escolhido, independentemente
                  de onde o worker esta a correr.
                </p>
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Frequencia" required error={fieldError(state, 'frequency')}>
                  <Select name="frequency" value={frequency}
                    onChange={(e) => setFrequency(e.target.value as typeof frequency)} required>
                    {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>
                </Field>

                <Field label="Fuso horario" required error={fieldError(state, 'timezone')}>
                  <Select name="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required>
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                  </Select>
                </Field>
              </div>

              {['DAILY', 'WEEKLY', 'MONTHLY', 'HOURLY'].includes(frequency) ? (
                <Field
                  label={frequency === 'HOURLY' ? 'Minuto da hora (use MM em HH:MM)' : 'Horarios'}
                  hint="Formato HH:MM, separados por virgula. Ex.: 09:00, 13:30, 19:00"
                  required error={fieldError(state, 'run_at_times')}
                >
                  <Input name="run_at_times" value={times} onChange={(e) => setTimes(e.target.value)} required />
                </Field>
              ) : <input type="hidden" name="run_at_times" value={times} />}

              {frequency === 'WEEKLY' ? (
                <Field label="Dias da semana" required error={fieldError(state, 'weekdays')}>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((day) => {
                      const active = weekdays.includes(day.value);
                      return (
                        <button
                          key={day.value} type="button"
                          onClick={() => setWeekdays((prev) =>
                            prev.includes(day.value)
                              ? prev.filter((d) => d !== day.value)
                              : [...prev, day.value].sort())}
                          className={`h-8 w-12 rounded-lg border text-xs font-medium transition-colors ${
                            active ? 'border-brand bg-brand/10 text-brand' : 'border-line text-muted hover:bg-raised'
                          }`}
                          aria-pressed={active}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              ) : null}

              {frequency === 'MONTHLY' ? (
                <Field label="Dias do mes" hint="Separados por virgula. O dia 31 executa no ultimo dia dos meses curtos."
                  error={fieldError(state, 'month_days')}>
                  <Input name="month_days" value={monthDays} onChange={(e) => setMonthDays(e.target.value)} />
                </Field>
              ) : <input type="hidden" name="month_days" value={monthDays} />}

              {frequency === 'INTERVAL' ? (
                <Field label="Intervalo em minutos" hint="Minimo 5 minutos." required
                  error={fieldError(state, 'interval_minutes')}>
                  <Input name="interval_minutes" type="number" min={5} value={interval}
                    onChange={(e) => setInterval(e.target.value)} required />
                </Field>
              ) : <input type="hidden" name="interval_minutes" value={interval} />}

              {frequency === 'CRON' ? (
                <Field label="Expressao cron" hint="5 campos: minuto hora dia mes dia-da-semana. Avaliada no fuso escolhido."
                  required error={fieldError(state, 'cron_expression')}>
                  <Input name="cron_expression" value={cron} onChange={(e) => setCron(e.target.value)}
                    className="font-mono" required />
                </Field>
              ) : <input type="hidden" name="cron_expression" value={cron} />}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Comeca em" required error={fieldError(state, 'starts_at')}>
                  <Input name="starts_at" type="datetime-local" value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)} required />
                </Field>
                <Field label="Termina em" hint="Deixe vazio para correr indefinidamente."
                  error={fieldError(state, 'ends_at')}>
                  <Input name="ends_at" type="datetime-local" value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)} />
                </Field>
              </div>

              <div className="rounded-lg border border-line bg-raised/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <CalendarClock className="h-4 w-4 text-brand" aria-hidden />
                    Pre-visualizar proximas execucoes
                  </p>
                  <button
                    type="button" onClick={runPreview} disabled={previewing}
                    className="h-7 rounded-lg border border-line bg-surface px-3 text-xs hover:bg-raised disabled:opacity-50"
                  >
                    {previewing ? 'A calcular…' : 'Calcular'}
                  </button>
                </div>
                {preview ? (
                  preview.runs.length > 0 ? (
                    <ul className="mt-2 space-y-0.5">
                      {preview.runs.map((run) => (
                        <li key={run} className="font-mono text-[11px] tabular-nums text-muted">
                          {formatDateTime(run, timezone)} ({timezone})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[11px] text-danger">{preview.message}</p>
                  )
                ) : (
                  <p className="mt-2 flex items-start gap-1 text-[11px] text-faint">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    Usa exatamente a mesma funcao que o scheduler — o que aparece aqui e o que vai executar.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><div><CardTitle>Modo de trabalho</CardTitle></div></CardHeader>
            <CardBody className="space-y-4">
              <Field label="Modo" required
                hint="Aprovacao: o resultado espera por si. Automatico: o NojAds publica sem revisao."
                error={fieldError(state, 'mode')}>
                <Select name="mode" defaultValue={task?.mode ?? 'APPROVAL'} required>
                  <option value="APPROVAL">Aprovacao — rever antes de publicar</option>
                  <option value="AUTOMATIC">Automatico — publicar sem revisao</option>
                </Select>
              </Field>

              <Field label="Configuracao adicional (JSON)"
                hint="Opcional. Instrucoes para a IA, objetivo, orcamento de campanhas automaticas."
                error={fieldError(state, 'config')}>
                <Textarea
                  name="config" rows={4} className="font-mono text-xs"
                  defaultValue={task ? JSON.stringify(task.config, null, 2) : '{}'}
                />
              </Field>

              {definition?.touchesMoney ? (
                <Alert tone="warning" title="Esta tarefa pode envolver dinheiro real">
                  Mesmo em modo automatico, o NojAds nao efetua pagamentos nem aumenta orcamentos
                  sem autorizacao explicita. Os limites estao em Definicoes &gt; Limites de gasto.
                </Alert>
              ) : null}
            </CardBody>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-faint">
              A tarefa e criada em pausa. Ative-a quando estiver pronto.
            </p>
            <SubmitButton>{submitLabel}</SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
