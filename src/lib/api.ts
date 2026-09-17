import 'server-only';
/** Uniform JSON responses. Errors always carry operation, step, reason, code, hint. */
import { NextResponse } from 'next/server';
import { normalizeError } from '@/lib/errors';

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: unknown, operation = 'operacao') {
  const appError = normalizeError(error, operation);
  return NextResponse.json(
    { ok: false, error: appError.toJSON(), display: appError.toDisplay() },
    { status: appError.status },
  );
}
