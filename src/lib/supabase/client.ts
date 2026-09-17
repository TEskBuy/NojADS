'use client';
/** Browser Supabase client. Anon key only — never the service role key. */
import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

export function createClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
