import 'server-only';
/**
 * Tenancy scoping for list queries.
 *
 * `accessibleClientIds` returns null for an ADMIN (everything) or a list for
 * everyone else. These helpers narrow a Supabase query to that list.
 *
 * They exist so the shape assertion happens exactly once, here, instead of an
 * `any` cast at every call site — and so a query that forgets to scope is a
 * visible omission rather than a silent leak across tenants.
 */

/** Matches no row, so an empty membership list returns nothing rather than everything. */
const NO_CLIENT = '00000000-0000-0000-0000-000000000000';

/**
 * The shape is deliberately shallow — typing `in()` as returning `Self` makes
 * TypeScript recurse through PostgREST's own generics until it gives up. The
 * single `as T` below is exact (PostgREST's `in()` returns `this`) and lives
 * only here, instead of an `any` cast at every call site.
 */
interface Scopable {
  in(column: string, values: readonly string[]): unknown;
}

export function scopeToClients<T>(
  query: T,
  clientIds: string[] | null,
  column = 'client_id',
): T {
  if (clientIds === null) return query;
  // The generic is unconstrained on purpose (see the note above); the shape is
  // asserted here and `in()` genuinely returns `this` in PostgREST.
  return (query as Scopable).in(column, clientIds.length > 0 ? clientIds : [NO_CLIENT]) as T;
}

/**
 * Runs a scoped `head: true, count: 'exact'` query and returns the number.
 *
 * Awaiting each count here — rather than putting a dozen PostgREST builders in
 * one `Promise.all` tuple — keeps the caller's types trivial to infer.
 */
export async function countScoped(
  // `unknown` on purpose: constraining this to Scopable makes TypeScript walk
  // PostgREST's generics for every call site until it gives up. The shape is
  // asserted once, here.
  build: () => unknown,
  clientIds: string[] | null,
  column = 'client_id',
): Promise<number> {
  const scoped = scopeToClients(build() as Scopable, clientIds, column) as unknown as
    PromiseLike<{ count: number | null }>;
  const { count } = await scoped;
  return count ?? 0;
}

export { NO_CLIENT };
