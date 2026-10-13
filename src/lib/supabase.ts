/**
 * Optional Supabase browser client.
 *
 * The app is designed to run in two modes:
 *  - `supabase`: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are set
 *  - `demo`: no credentials yet, so the seeded demo workspace is used instead
 *
 * Nothing here throws when the environment is missing: the app falls back to
 * demo mode so the UI is always explorable.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function getSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
}

export function getSupabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseUrl().length > 0 && getSupabaseAnonKey().length > 0;
}

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  if (!isSupabaseConfigured()) {
    cached = null;
    return cached;
  }

  cached = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return cached;
}
