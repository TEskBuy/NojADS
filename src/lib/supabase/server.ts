import 'server-only';
/**
 * Server Supabase client bound to the request's cookies. Every query made
 * through this client is subject to RLS as the signed-in user — which is why
 * authorisation is never left to the interface alone.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';

export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: the middleware refreshes the
          // session cookie instead. Safe to ignore.
        }
      },
    },
  });
}
