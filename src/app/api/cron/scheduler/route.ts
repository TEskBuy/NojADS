/**
 * Vercel Cron entry point for the scheduler.
 *
 * This triggers a scheduler tick; it is NOT a replacement for the worker.
 * Serverless functions are time-limited, so the queue is drained by the
 * long-running worker process (npm run worker). Booking is idempotent, so
 * this cron and a standalone scheduler can both run without double-booking.
 */
import { type NextRequest } from 'next/server';
import { runSchedulerTick } from '@/server/scheduler/scheduler';
import { serverEnv } from '@/lib/env';
import { safeCompare } from '@/lib/crypto';
import { fail, ok } from '@/lib/api';
import { AuthorizationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorize(request: NextRequest): void {
  const env = serverEnv();
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';

  // Vercel Cron sends its own header; otherwise CRON_SECRET is required.
  const fromVercel = request.headers.get('x-vercel-cron') !== null;
  if (fromVercel) return;

  if (!env.cronSecret || !provided || !safeCompare(env.cronSecret, provided)) {
    throw new AuthorizationError({
      operation: 'execucao do scheduler',
      message: 'Pedido nao autorizado.',
      hint: 'Envie o cabecalho Authorization: Bearer <CRON_SECRET>.',
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    authorize(request);
    const report = await runSchedulerTick();
    return ok(report);
  } catch (err) {
    return fail(err, 'execucao do scheduler');
  }
}

export const POST = GET;
