import 'server-only';
/**
 * Service-role client. Bypasses RLS.
 *
 * Only three kinds of caller may use it: workers, webhook handlers, and route
 * handlers that have already checked authorisation themselves. Never import
 * this from a component.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { serverEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';

let cached: SupabaseClient | null = null;

export function createAdminSupabase(): SupabaseClient {
  if (cached) return cached;
  const env = serverEnv();
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new AppError({
      code: 'SUPABASE_ADMIN_NOT_CONFIGURED',
      operation: 'acesso administrativo a base de dados',
      step: 'carregamento de credenciais',
      message: 'NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao estao definidas.',
      hint: 'Defina ambas no ambiente do servidor. A service key nunca deve ter prefixo NEXT_PUBLIC_.',
      status: 500,
    });
  }
  cached = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-nojads-client': 'service-role' } },
  });
  return cached;
}
