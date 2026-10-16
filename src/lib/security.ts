/**
 * Cross-cutting security helpers: log redaction, a client-side rate limiter and
 * a source-hygiene scanner used by the tests.
 *
 * None of this replaces server-side enforcement. The authoritative limits live
 * in Postgres (RLS policies, constraints, write-rate triggers in migration
 * 006) and in Supabase Auth's own rate limits; the browser side exists so a
 * normal user gets a clear message instead of a wall of failed requests.
 */

const REDACTIONS: Array<{ pattern: RegExp; replace: (match: string) => string }> = [
  // Supabase keys, JWTs and provider tokens all start with eyJ / sbp_ / sk-.
  { pattern: /\beyJ[A-Za-z0-9._-]{10,}/g, replace: () => "[redacted token]" },
  { pattern: /\bsbp_[A-Za-z0-9]{10,}/g, replace: () => "[redacted key]" },
  { pattern: /\bsk-[A-Za-z0-9_-]{10,}/g, replace: () => "[redacted key]" },
  { pattern: /\bsk_live_[A-Za-z0-9]{10,}/g, replace: () => "[redacted key]" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, replace: () => "[redacted token]" },
  { pattern: /\bBearer\s+[A-Za-z0-9._-]{8,}/gi, replace: () => "Bearer [redacted]" },
  // Emails: keep the domain so a log line is still useful, hide the person.
  {
    pattern: /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)\b/g,
    replace: (match) => `***@${match.split("@")[1]}`,
  },
  // Long opaque strings (session ids, refresh tokens, hex secrets).
  { pattern: /\b[A-Za-z0-9_-]{40,}\b/g, replace: () => "[redacted]" },
  // Indian mobile numbers, with or without a country code.
  { pattern: /(?:\+91[-\s]?)?\b[6-9]\d{9}\b/g, replace: () => "[redacted phone]" },
];

/** Removes tokens, keys, emails and phone numbers from anything we log. */
export function redactSensitive(value: unknown): string {
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (value instanceof Error) {
    text = `${value.name}: ${value.message}`;
  } else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }

  return REDACTIONS.reduce(
    (current, rule) => current.replace(rule.pattern, (match) => rule.replace(match)),
    text,
  );
}

const SENSITIVE_KEYS = /pass|token|secret|key|auth|cookie|email|note|label|amount/i;

/** Redacts sensitive fields of a record, keeping the shape readable. */
export function redactRecord(record: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      SENSITIVE_KEYS.test(key)
        ? value === null || value === undefined
          ? ""
          : "[redacted]"
        : redactSensitive(value),
    ]),
  );
}

/**
 * A message safe to show the user. Supabase errors carry codes, not secrets,
 * but messages can echo an email address back, so everything goes through
 * `redactSensitive` first.
 */
export function safeErrorMessage(error: unknown, fallback = "Something went wrong."): string {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const clean = redactSensitive(message).trim();
  return clean.length > 0 ? clean.slice(0, 300) : fallback;
}

export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export type RateLimiter = {
  check: (key: string, now?: number) => RateLimitDecision;
  reset: (key?: string) => void;
};

/**
 * Fixed-window limiter. In-memory on purpose: it is a UX guard, and the hard
 * limit is the per-user trigger in the database.
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string, now: number = Date.now()): RateLimitDecision {
      const bucket = windows.get(key);
      if (!bucket || bucket.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true, remaining: options.limit - 1, retryAfterMs: 0 };
      }
      if (bucket.count >= options.limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(0, bucket.resetAt - now),
        };
      }
      bucket.count += 1;
      return {
        allowed: true,
        remaining: options.limit - bucket.count,
        retryAfterMs: 0,
      };
    },
    reset(key?: string) {
      if (key) windows.delete(key);
      else windows.clear();
    },
  };
}

export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.ceil(seconds / 60)}m`;
}
