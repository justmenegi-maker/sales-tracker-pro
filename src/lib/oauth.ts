/**
 * Google (OAuth) sign-in helpers.
 *
 * The app is a static export, so nothing on a server can complete the flow:
 * supabase-js sends the browser to Google, Google comes back to Supabase, and
 * Supabase redirects the browser to `/auth/callback?code=…` in this app.
 *
 * `detectSessionInUrl` stays off (see `lib/supabase.ts`) — that option also
 * accepts tokens delivered in the address bar. Instead the callback route reads
 * the single-use PKCE `code` itself, exchanges it for a session with
 * `exchangeCodeForSession`, and strips the query string before anything else
 * runs. The code verifier lives in the tab's sessionStorage, which survives the
 * round trip, and no token is ever read from the URL.
 */
import { safeReturnPath } from "./validation";

export const OAUTH_CALLBACK_PATH = "/auth/callback";

/** True for the origins we are willing to redirect back to. */
function trustedOrigin(origin: string): string | null {
  try {
    const parsed = new URL(origin);
    const isLocal =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * `redirectTo` for `signInWithOAuth`: this origin's callback route, plus the
 * page to land on afterwards when it is a path inside this app.
 *
 * Returns null when the origin is not https (or localhost), so a misconfigured
 * deployment cannot bounce a sign-in to an untrusted host.
 */
export function buildOAuthRedirect(
  origin: string,
  returnTo: string | null | undefined,
): string | null {
  const safeOrigin = trustedOrigin(origin);
  if (!safeOrigin) return null;

  const target = safeReturnPath(returnTo ?? null);
  const callback = `${safeOrigin}${OAUTH_CALLBACK_PATH}`;
  // Never bounce back into the callback itself: that would loop.
  if (!target || target.startsWith(OAUTH_CALLBACK_PATH)) return callback;
  return `${callback}?returnTo=${encodeURIComponent(target)}`;
}

export type OAuthCallback = {
  /** Single-use PKCE code to exchange, if the provider returned one. */
  code: string | null;
  /** Provider error, already human-readable. */
  error: string | null;
  /** Where to land afterwards, when the app asked for somewhere specific. */
  returnTo: string | null;
};

const CODE_PATTERN = /^[A-Za-z0-9._~-]{6,512}$/;

/**
 * Reads only what a PKCE callback is allowed to carry.
 *
 * Note what is deliberately ignored: `access_token`, `refresh_token`,
 * `provider_token` and `code_verifier`. A token in the address bar is treated
 * as an attack, not a session, so it is never read — let alone stored.
 */
export function readOAuthCallback(search: string): OAuthCallback {
  const params = new URLSearchParams(search ?? "");
  const rawCode = params.get("code");
  const code = rawCode && CODE_PATTERN.test(rawCode) ? rawCode : null;

  const description = params.get("error_description") ?? params.get("error");
  const error = description
    ? description.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) ||
      "Google sign-in was not completed."
    : null;

  return {
    code,
    error,
    returnTo: safeReturnPath(params.get("returnTo")),
  };
}

/**
 * Did this account's address come from a provider that verified it?
 *
 * Supabase always stamps `email_confirmed_at` for the email/password flow, but
 * an OAuth user's confirmed state is not guaranteed to appear there, so an
 * OAuth provider (Google signs the `email_verified` claim) counts as verified
 * too. Anything else stays unverified and is refused.
 */
export function providerVerifiedEmail(user: {
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
  app_metadata?: {
    provider?: string | null;
    providers?: string[] | null;
  } | null;
}): boolean {
  if (user.email_confirmed_at || user.confirmed_at) return true;

  const provider = user.app_metadata?.provider;
  if (typeof provider === "string" && provider.length > 0 && provider !== "email") {
    return true;
  }

  const providers = user.app_metadata?.providers ?? [];
  return providers.some((entry) => entry !== "email");
}

/**
 * The primary provider of a session, as Supabase records it (`"email"`,
 * `"google"`, …). Used to hide password controls on an OAuth-only account.
 */
export function primaryProvider(user: {
  app_metadata?: { provider?: string | null } | null;
}): string {
  const provider = user.app_metadata?.provider;
  return typeof provider === "string" && provider.length > 0 ? provider : "email";
}
