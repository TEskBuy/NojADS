/**
 * Standalone scheduler process.
 *
 *   npm run scheduler
 *
 * Runs alongside the worker on any host that keeps a process alive (Railway,
 * Render, Fly, a VPS). Vercel Cron can drive /api/cron/scheduler instead — the
 * booking is idempotent, so both together is safe.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { runMaintenanceTick, runSchedulerTick } from './scheduler';
import { serverEnv } from '@/lib/env';

let running = true;

async function main() {
  const env = serverEnv();
  const interval = env.schedulerIntervalMs;
  console.log(`[NojAds] Scheduler iniciado. Intervalo: ${interval}ms`);

  let ticks = 0;
  while (running) {
    const started = Date.now();
    try {
      const report = await runSchedulerTick();
      if (report.dispatched > 0 || report.errors.length > 0) {
        console.log(
          `[scheduler] analisadas=${report.scanned} despachadas=${report.dispatched} ` +
          `ignoradas=${report.skipped} recuperadas=${report.reaped} erros=${report.errors.length}`,
        );
      }
      // Housekeeping roughly hourly, independent of the tick interval.
      ticks += 1;
      if (ticks % Math.max(1, Math.round(3_600_000 / interval)) === 0) {
        const maintenance = await runMaintenanceTick();
        console.log('[scheduler] manutencao', maintenance);
      }
    } catch (err) {
      console.error('[scheduler] falha no ciclo:', (err as Error).message);
    }
    const elapsed = Date.now() - started;
    await new Promise((r) => setTimeout(r, Math.max(1000, interval - elapsed)));
  }
  console.log('[NojAds] Scheduler terminado.');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[NojAds] ${signal} recebido, a terminar o scheduler...`);
    running = false;
  });
}

main().catch((err) => {
  console.error('[NojAds] Scheduler falhou:', err);
  process.exit(1);
});
