/**
 * Scheduler maths.
 *
 * The point of these: "todos os dias as 09:00" must mean 09:00 where the client
 * is, on both sides of a DST change, whatever timezone the worker runs in.
 */
import { describe, expect, it } from 'vitest';
import { computeNextRun, describeSchedule, type ScheduleSpec } from '@/server/tasks/schedule';

function spec(partial: Partial<ScheduleSpec>): ScheduleSpec {
  return {
    frequency: 'DAILY',
    timezone: 'Africa/Luanda',
    runAtTimes: ['09:00'],
    weekdays: [],
    monthDays: [],
    intervalMinutes: null,
    cronExpression: null,
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: null,
    lastRunAt: null,
    ...partial,
  };
}

describe('computeNextRun — diario', () => {
  it('encontra o proximo horario no mesmo dia', () => {
    // Luanda is UTC+1 all year, so 09:00 local is 08:00Z.
    const next = computeNextRun(spec({}), new Date('2026-03-10T06:00:00Z'));
    expect(next?.toISOString()).toBe('2026-03-10T08:00:00.000Z');
  });

  it('salta para o dia seguinte quando o horario ja passou', () => {
    const next = computeNextRun(spec({}), new Date('2026-03-10T10:00:00Z'));
    expect(next?.toISOString()).toBe('2026-03-11T08:00:00.000Z');
  });

  it('usa varios horarios por dia pela ordem certa', () => {
    const daily = spec({ runAtTimes: ['09:00', '13:30', '19:00'] });
    expect(computeNextRun(daily, new Date('2026-03-10T06:00:00Z'))?.toISOString())
      .toBe('2026-03-10T08:00:00.000Z');
    expect(computeNextRun(daily, new Date('2026-03-10T09:00:00Z'))?.toISOString())
      .toBe('2026-03-10T12:30:00.000Z');
    expect(computeNextRun(daily, new Date('2026-03-10T13:00:00Z'))?.toISOString())
      .toBe('2026-03-10T18:00:00.000Z');
  });

  it('nao devolve execucoes depois da data de fim', () => {
    const ending = spec({ endsAt: new Date('2026-03-10T00:00:00Z') });
    expect(computeNextRun(ending, new Date('2026-03-11T00:00:00Z'))).toBeNull();
  });

  it('nunca comeca antes da data de inicio', () => {
    const future = spec({ startsAt: new Date('2026-06-01T00:00:00Z') });
    const next = computeNextRun(future, new Date('2026-03-10T06:00:00Z'));
    expect(next!.getTime()).toBeGreaterThanOrEqual(new Date('2026-06-01T00:00:00Z').getTime());
  });
});

describe('computeNextRun — fusos horarios', () => {
  it('mantem a hora local em Lisboa quando a hora de verao entra', () => {
    // Portugal moves to WEST on 29 March 2026. Local 09:00 is 09:00Z before
    // the change and 08:00Z after it — the wall clock is what stays fixed.
    const lisbon = spec({ timezone: 'Europe/Lisbon' });
    const before = computeNextRun(lisbon, new Date('2026-03-27T00:00:00Z'));
    const after = computeNextRun(lisbon, new Date('2026-03-30T00:00:00Z'));
    expect(before?.toISOString()).toBe('2026-03-27T09:00:00.000Z');
    expect(after?.toISOString()).toBe('2026-03-30T08:00:00.000Z');
  });

  it('a mesma configuracao em fusos diferentes produz instantes diferentes', () => {
    const luanda = computeNextRun(spec({}), new Date('2026-05-01T00:00:00Z'));
    const saoPaulo = computeNextRun(
      spec({ timezone: 'America/Sao_Paulo' }), new Date('2026-05-01T00:00:00Z'));
    expect(luanda!.toISOString()).not.toBe(saoPaulo!.toISOString());
  });
});

describe('computeNextRun — semanal e mensal', () => {
  it('escolhe o proximo dia da semana configurado', () => {
    // 2026-03-10 is a Tuesday. Monday(1) and Thursday(4) are configured.
    const weekly = spec({ frequency: 'WEEKLY', weekdays: [1, 4] });
    const next = computeNextRun(weekly, new Date('2026-03-10T12:00:00Z'));
    expect(next?.toISOString()).toBe('2026-03-12T08:00:00.000Z'); // Thursday
  });

  it('o dia 31 executa no ultimo dia de um mes curto', () => {
    const monthly = spec({ frequency: 'MONTHLY', monthDays: [31] });
    const next = computeNextRun(monthly, new Date('2026-04-15T00:00:00Z'));
    expect(next?.toISOString().slice(0, 10)).toBe('2026-04-30');
  });
});

describe('computeNextRun — intervalo, cron e unica', () => {
  it('conta o intervalo a partir da ultima execucao', () => {
    const interval = spec({
      frequency: 'INTERVAL',
      intervalMinutes: 30,
      lastRunAt: new Date('2026-03-10T10:00:00Z'),
    });
    const next = computeNextRun(interval, new Date('2026-03-10T10:05:00Z'));
    expect(next?.toISOString()).toBe('2026-03-10T10:30:00.000Z');
  });

  it('recupera sem repetir todos os intervalos perdidos', () => {
    const interval = spec({
      frequency: 'INTERVAL',
      intervalMinutes: 60,
      lastRunAt: new Date('2026-03-10T00:00:00Z'),
    });
    const next = computeNextRun(interval, new Date('2026-03-10T05:30:00Z'));
    expect(next?.toISOString()).toBe('2026-03-10T06:00:00.000Z');
  });

  it('respeita uma expressao cron', () => {
    const cron = spec({ frequency: 'CRON', cronExpression: '0 6 * * *' });
    const next = computeNextRun(cron, new Date('2026-03-10T10:00:00Z'));
    expect(next?.toISOString()).toBe('2026-03-11T05:00:00.000Z'); // 06:00 Luanda
  });

  it('devolve null para cron invalido em vez de rebentar', () => {
    const cron = spec({ frequency: 'CRON', cronExpression: 'isto nao e cron' });
    expect(computeNextRun(cron, new Date())).toBeNull();
  });

  it('uma tarefa ONCE nao volta a executar depois de correr', () => {
    const once = spec({ frequency: 'ONCE', lastRunAt: new Date('2026-03-10T08:00:00Z') });
    expect(computeNextRun(once, new Date('2026-03-11T00:00:00Z'))).toBeNull();
  });
});

describe('describeSchedule', () => {
  it('descreve o agendamento em portugues', () => {
    expect(describeSchedule(spec({ runAtTimes: ['09:00', '18:00'] })))
      .toBe('Todos os dias as 09:00, 18:00');
    expect(describeSchedule(spec({ frequency: 'WEEKLY', weekdays: [1, 5] })))
      .toContain('segunda');
    expect(describeSchedule(spec({ frequency: 'INTERVAL', intervalMinutes: 120 })))
      .toBe('A cada 2 hora(s)');
  });
});
