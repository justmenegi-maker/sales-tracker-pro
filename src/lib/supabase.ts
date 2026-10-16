/**
 * Optional Supabase browser client.
 *
 * The app is designed to run in two modes:
 *  - `supabase`: NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY are set
 *  - `demo`: no credentials yet, so the seeded demo workspace is used instead
 *
 * Nothing here throws when the environment is missing: the app falls back to
 * demo mode so the UI is always explorable.
 *
 * Security notes:
 *  - Only a *publishable* key may live in the browser. A key whose JWT says
 *    `role: service_role` bypasses row-level security, so it is refused here
 *    (and reported) rather than shipped to a client.
 *  - The session is kept in `sessionStorage` + memory, never localStorage, and
 *    never read from a URL (`detectSessionInUrl: false`, PKCE flow).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authStorage } from "./auth-storage";
import { logError } from "./log";

let cached: SupabaseClient | null | undefined;

export function getSupabaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
}

export function getSupabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
}

function urlIsSafe(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:") return true;
    // Plain HTTP is only tolerated for a local Supabase stack.
    return (
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * True when the key is safe to hand to a browser: either a publishable key
 * (`sb_publishable_…`) or a JWT whose role is not `service_role`.
 */
export function isBrowserSafeKey(key: string): boolean {
  if (key.length === 0) return false;
  if (key.startsWith("sb_publishable_")) return true;
  if (key.startsWith("sb_secret_")) return false;
  const payload = decodeJwtPayload(key);
  if (!payload) return false;
  return payload.role !== "service_role";
}

export function isSupabaseConfigured(): boolean {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  return url.length > 0 && key.length > 0 && urlIsSafe(url) && isBrowserSafeKey(key);
}

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  if (!isSupabaseConfigured()) {
    const url = getSupabaseUrl();
    const key = getSupabaseAnonKey();
    if (key.length > 0 && !isBrowserSafeKey(key)) {
      // Loud, but the value itself never reaches the log or the bundle.
      logError(
        "Refusing to start: the configured Supabase key is server-side only. Use the anon/publishable key in the browser.",
      );
    } else if (url.length > 0 && !urlIsSafe(url)) {
      logError("Refusing to start: NEXT_PUBLIC_SUPABASE_URL must be https.");
    }
    cached = null;
    return cached;
  }

  cached = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      // Tokens stay in this tab (sessionStorage) and in memory, not in
      // localStorage where any future script on the origin could read them.
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      // A token must never arrive through the address bar or the referrer.
      detectSessionInUrl: false,
      flowType: "pkce",
    },
    global: {
      headers: { "x-application-name": "sktapri-daily-sales" },
    },
  });

  return cached;
}
