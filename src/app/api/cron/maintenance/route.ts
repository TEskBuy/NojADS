/** Hourly housekeeping: expired OAuth states, stale approvals, token warnings. */
import { type NextRequest } from 'next/server';
import { runMaintenanceTick } from '@/server/scheduler/scheduler';
import { reapStalledJobs } from '@/server/queue/queue';
import { serverEnv } from '@/lib/env';
import { safeCompare } from '@/lib/crypto';
import { fail, ok } from '@/lib/api';
import { AuthorizationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const env = serverEnv();
    const header = request.headers.get('authorization') ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
    const fromVercel = request.headers.get('x-vercel-cron') !== null;

    if (!fromVercel && (!env.cronSecret || !provided || !safeCompare(env.cronSecret, provided))) {
      throw new AuthorizationError({ operation: 'manutencao', message: 'Pedido nao autorizado.' });
    }

    const [maintenance, reaped] = await Promise.all([runMaintenanceTick(), reapStalledJobs()]);
    return ok({ ...maintenance, reapedJobs: reaped });
  } catch (err) {
    return fail(err, 'manutencao');
  }
}

export const POST = GET;
