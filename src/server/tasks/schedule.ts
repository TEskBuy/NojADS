/**
 * Next-run computation.
 *
 * Pure, timezone-aware, and tested (tests/schedule.test.ts). Every task carries
 * its own IANA timezone, so "todos os dias as 09:00" means 09:00 where the
 * client is, across DST changes, regardless of where the worker runs.
 */
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import parser from 'cron-parser';
import type { Frequency, Task, TaskStatus } from '@/types/models';

export interface ScheduleSpec {
  frequency: Frequency;
  timezone: string;
  runAtTimes: string[];       // 'HH:MM' local
  weekdays: number[];         // 1 = Monday .. 7 = Sunday (ISO)
  monthDays: number[];        // 1..31
  intervalMinutes?: number | null;
  cronExpression?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  lastRunAt?: Date | null;
}

const MAX_LOOKAHEAD_DAYS = 400;

function parseTime(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Builds the UTC instant for a wall-clock time on a given local calendar day.
 * `fromZonedTime` resolves the offset that applies on that date, which is what
 * makes DST transitions come out right.
 */
function instantFor(localDay: Date, hours: number, minutes: number, timezone: string): Date {
  const stamp =
    `${localDay.getFullYear()}-${pad(localDay.getMonth() + 1)}-${pad(localDay.getDate())}` +
    `T${pad(hours)}:${pad(minutes)}:00`;
  return fromZonedTime(stamp, timezone);
}

/** ISO weekday: Monday = 1 ... Sunday = 7. */
function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function computeNextRun(spec: ScheduleSpec, from: Date = new Date()): Date | null {
  const floor = spec.startsAt > from ? spec.startsAt : from;

  if (spec.endsAt && floor >= spec.endsAt) return null;

  const candidate = computeCandidate(spec, floor);
  if (!candidate) return null;
  if (spec.endsAt && candidate > spec.endsAt) return null;
  return candidate;
}

function computeCandidate(spec: ScheduleSpec, floor: Date): Date | null {
  switch (spec.frequency) {
    case 'ONCE':
      return spec.lastRunAt ? null : (spec.startsAt > floor ? spec.startsAt : spec.startsAt);

    case 'INTERVAL': {
      const minutes = spec.intervalMinutes ?? 60;
      const base = spec.lastRunAt ?? spec.startsAt;
      let next = new Date(base.getTime() + minutes * 60_000);
      if (next <= floor) {
        // Catch up without replaying every missed slot.
        const elapsed = floor.getTime() - base.getTime();
        const periods = Math.ceil(elapsed / (minutes * 60_000));
        next = new Date(base.getTime() + periods * minutes * 60_000);
        if (next <= floor) next = new Date(next.getTime() + minutes * 60_000);
      }
      return next;
    }

    case 'CRON': {
      if (!spec.cronExpression) return null;
      try {
        const interval = parser.parseExpression(spec.cronExpression, {
          currentDate: floor,
          tz: spec.timezone,
        });
        return interval.next().toDate();
      } catch {
        return null;
      }
    }

    case 'HOURLY': {
      const minute = parseTime(spec.runAtTimes[0] ?? '00:00')?.minutes ?? 0;
      const next = new Date(floor);
      next.setUTCSeconds(0, 0);
      next.setUTCMinutes(minute);
      if (next <= floor) next.setUTCHours(next.getUTCHours() + 1);
      return next;
    }

    case 'DAILY':
    case 'WEEKLY':
    case 'MONTHLY':
      return scanCalendar(spec, floor);

    default:
      return null;
  }
}

/**
 * Walks forward day by day in the task's own timezone and returns the first
 * matching wall-clock slot strictly after `floor`.
 */
function scanCalendar(spec: ScheduleSpec, floor: Date): Date | null {
  const times = (spec.runAtTimes.length ? spec.runAtTimes : ['09:00'])
    .map(parseTime)
    .filter((t): t is { hours: number; minutes: number } => t !== null)
    .sort((a, b) => (a.hours - b.hours) || (a.minutes - b.minutes));
  if (times.length === 0) return null;

  const localFloor = toZonedTime(floor, spec.timezone);

  for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset += 1) {
    const day = new Date(
      localFloor.getFullYear(), localFloor.getMonth(), localFloor.getDate() + offset,
    );

    if (spec.frequency === 'WEEKLY') {
      const wanted = spec.weekdays.length ? spec.weekdays : [1];
      if (!wanted.includes(isoWeekday(day))) continue;
    }
    if (spec.frequency === 'MONTHLY') {
      const wanted = spec.monthDays.length ? spec.monthDays : [1];
      const lastDayOfMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
      // A task set to the 31st still fires on the last day of a short month.
      const matches = wanted.some((d) =>
        d === day.getDate() || (d > lastDayOfMonth && day.getDate() === lastDayOfMonth));
      if (!matches) continue;
    }

    for (const time of times) {
      const instant = instantFor(day, time.hours, time.minutes, spec.timezone);
      if (instant > floor) return instant;
    }
  }

  return null;
}

/** Builds a ScheduleSpec from a persisted task row. */
export function specFromTask(task: Pick<Task,
  'frequency' | 'timezone' | 'run_at_times' | 'weekdays' | 'month_days' |
  'interval_minutes' | 'cron_expression' | 'starts_at' | 'ends_at' | 'last_run_at'>): ScheduleSpec {
  return {
    frequency: task.frequency,
    timezone: task.timezone,
    runAtTimes: task.run_at_times ?? [],
    weekdays: task.weekdays ?? [],
    monthDays: task.month_days ?? [],
    intervalMinutes: task.interval_minutes,
    cronExpression: task.cron_expression,
    startsAt: new Date(task.starts_at),
    endsAt: task.ends_at ? new Date(task.ends_at) : null,
    lastRunAt: task.last_run_at ? new Date(task.last_run_at) : null,
  };
}

/** Only ACTIVE tasks are ever scheduled. */
export function isSchedulable(status: TaskStatus): boolean {
  return status === 'ACTIVE';
}

/** Human summary shown in the task list, e.g. "Todos os dias as 09:00, 18:00". */
export function describeSchedule(spec: ScheduleSpec): string {
  const times = spec.runAtTimes.length ? spec.runAtTimes.join(', ') : '09:00';
  const names = ['', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
  switch (spec.frequency) {
    case 'ONCE': return `Uma vez, em ${spec.startsAt.toLocaleString('pt-PT')}`;
    case 'INTERVAL': {
      const minutes = spec.intervalMinutes ?? 60;
      return minutes % 60 === 0
        ? `A cada ${minutes / 60} hora(s)`
        : `A cada ${minutes} minutos`;
    }
    case 'HOURLY': return 'De hora a hora';
    case 'DAILY': return `Todos os dias as ${times}`;
    case 'WEEKLY': {
      const days = (spec.weekdays.length ? spec.weekdays : [1]).map((d) => names[d]).join(', ');
      return `Todas as ${days} as ${times}`;
    }
    case 'MONTHLY': {
      const days = (spec.monthDays.length ? spec.monthDays : [1]).join(', ');
      return `Dias ${days} de cada mes as ${times}`;
    }
    case 'CRON': return `Cron: ${spec.cronExpression}`;
    default: return 'Sem agendamento';
  }
}
