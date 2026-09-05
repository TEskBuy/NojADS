/**
 * Standalone worker process.
 *
 *   npm run worker
 *
 * This must run somewhere that keeps a process alive — Railway, Render, Fly, a
 * VPS, a container. Vercel serverless functions are the wrong home for it:
 * they are time-limited by design, which is exactly what a queue worker is not.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { runWorkerLoop } from './runner';
import { serverEnv } from '@/lib/env';
import type { QueueName } from '@/server/queue/queue';

const signal = { stopped: false };

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[NojAds] ${sig} recebido. A terminar apos os trabalhos em curso...`);
    signal.stopped = true;
    setTimeout(() => process.exit(0), 30_000).unref();
  });
}

const env = serverEnv();

runWorkerLoop({
  workerId: env.workerId,
  queues: env.workerQueues as QueueName[],
  concurrency: env.workerConcurrency,
  pollIntervalMs: env.workerPollIntervalMs,
  signal,
}).catch((err) => {
  console.error('[NojAds] Worker falhou:', err);
  process.exit(1);
});
