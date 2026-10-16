/**
 * Source-hygiene checks.
 *
 * These do not test behaviour; they fail the build's test run when a pattern
 * that the security review removed is reintroduced: raw HTML, eval-style code
 * injection, string-built SQL, secrets with a NEXT_PUBLIC_ prefix, tokens in
 * localStorage, or an upload input nobody validates.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Test files describe the banned patterns, so they are not scanned themselves.
const files = walk(SRC).filter(
  (file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file),
);
const sources = files.map((file) => ({
  path: relative(ROOT, file),
  text: readFileSync(file, "utf8"),
}));

function offenders(pattern: RegExp, allow: string[] = []): string[] {
  return sources
    .filter((file) => !allow.includes(file.path))
    .filter((file) => pattern.test(file.text))
    .map((file) => file.path);
}

describe("cross-site scripting", () => {
  it("never renders raw HTML or writes to the document", () => {
    expect(offenders(/dangerouslySetInnerHTML/)).toEqual([]);
    expect(offenders(/\bdocument\.write\b/)).toEqual([]);
    expect(offenders(/<script[\s>]/i)).toEqual([]);
  });

  it("never reaches for code-injection primitives", () => {
    expect(offenders(/\beval\s*\(/)).toEqual([]);
    expect(offenders(/new\s+Function\s*\(/)).toEqual([]);
    expect(offenders(/setTimeout\s*\(\s*["'`]/)).toEqual([]);
  });
});

describe("SQL", () => {
  it("only talks to the database through the query builder", () => {
    // No hand-built SQL: the PostgREST builder escapes and parameterises values.
    expect(offenders(/\b(select|insert into|update|delete from)\b[^;`]{0,60}\$\{/i)).toEqual(
      [],
    );
    expect(offenders(/\.rpc\(\s*`/)).toEqual([]);
  });

  it("keeps the browser on the publishable keys only", () => {
    const unsafe = sources.flatMap((file) =>
      [...file.text.matchAll(/process\.env\.([A-Z0-9_]+)/g)]
        .map((match) => match[1])
        .filter(
          (name) => name !== "NODE_ENV" && !name.startsWith("NEXT_PUBLIC_"),
        )
        .map((name) => `${file.path}:${name}`),
    );
    expect(unsafe).toEqual([]);
  });
});

describe("sessions", () => {
  it("keeps supabase-js out of localStorage and out of the URL", () => {
    const supabase = sources.find((file) => file.path.endsWith("lib/supabase.ts"));
    expect(supabase).toBeDefined();
    expect(supabase!.text).toContain("storage: authStorage");
    expect(supabase!.text).toContain("detectSessionInUrl: false");

    const storage = sources.find((file) => file.path.endsWith("lib/auth-storage.ts"));
    expect(storage).toBeDefined();
    expect(storage!.text).not.toContain("localStorage.setItem");
    expect(storage!.text).toContain("sessionStorage");
  });

  it("refuses a server-side key in the browser bundle", () => {
    const supabase = sources.find((file) => file.path.endsWith("lib/supabase.ts"));
    expect(supabase!.text).toContain("service_role");
    expect(supabase!.text).toContain("isBrowserSafeKey");
  });

  it("completes the Google redirect by exchanging the code, never by reading a fragment", () => {
    const callback = sources.find((file) => file.path.endsWith("auth/callback/page.tsx"));
    expect(callback).toBeDefined();
    expect(callback!.text).toContain("completeGoogleSignIn");
    expect(callback!.text).toContain("readOAuthCallback");
    expect(callback!.text).toContain("replaceState");

    // The store is the single place that performs the exchange.
    expect(
      sources
        .filter((file) => file.text.includes(".exchangeCodeForSession("))
        .map((file) => file.path),
    ).toEqual(["src/lib/store.tsx"]);

    // Implicit-flow tokens live in the URL fragment; nothing here reads it.
    expect(offenders(/location\.hash/)).toEqual([]);
  });
});

describe("uploads", () => {
  it("has no file input that skips validation", () => {
    const withFileInput = sources.filter((file) => /type=["']file["']/.test(file.text));
    for (const file of withFileInput) {
      expect(file.text).toContain("validateUploadFile");
    }
    // The guardrail exists even though nothing uploads today.
    expect(
      sources.some((file) => file.path.endsWith("lib/validation.ts") &&
        file.text.includes("validateUploadFile")),
    ).toBe(true);
  });
});

describe("repository", () => {
  const gitignore = readFileSync(join(ROOT, ".gitignore"), "utf8");

  it("ignores env files and their variants", () => {
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^\*\.env$/m);
    expect(gitignore).toMatch(/^\*\.env\.\*$/m);
  });
});

describe("database hardening migration", () => {
  const migration = readFileSync(
    join(ROOT, "supabase/migrations/006_security_hardening.sql"),
    "utf8",
  );

  it("enables row-level security and takes privileges away from anon", () => {
    for (const table of [
      "branches",
      "profiles",
      "daily_reports",
      "report_lines",
      "debts",
      "debt_payments",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from anon`);
    }
  });

  it("keeps the privilege-escalation and append-only guards", () => {
    expect(migration).toContain("create or replace function public.is_admin()");
    expect(migration).toContain("guard_profile_update");
    expect(migration).toContain("guard_daily_report_update");
    expect(migration).toContain("guard_debt_payment_amount");
    expect(migration).toContain("enforce_write_rate_limit");
  });

  it("bounds every value the browser can send", () => {
    for (const constraint of [
      "daily_reports_cash_paise_range",
      "daily_reports_report_date_sane",
      "daily_reports_review_status_allowed",
      "report_lines_amount_range",
      "report_lines_label_len",
      "debts_product_name_len",
      "debt_payments_amount_positive",
      "debt_payments_note_len",
      "profiles_display_name_len",
    ]) {
      expect(migration).toContain(constraint);
    }
  });
});

describe("trusted maintenance", () => {
  const migration = readFileSync(
    join(ROOT, "supabase/migrations/007_trusted_maintenance.sql"),
    "utf8",
  );

  it("lets the SQL editor link a login to a branch", () => {
    // The profile guard has to let a JWT-less context through, or the documented
    // way to link a branch login fails and that login can never file a report.
    expect(migration).toContain("create or replace function public.guard_profile_update()");
    expect(migration).toContain("if auth.uid() is null then");
    expect(migration).toContain("link_branch_user");
    expect(migration).toContain("link_admin_user");
  });

  it("keeps the profile-linking functions away from the browser", () => {
    // Supabase grants EXECUTE on new functions to anon/authenticated by default;
    // an RPC-reachable link_admin_user would let a visitor promote themselves.
    expect(migration).toContain(
      "revoke all on function public.link_branch_user(text, text) from public, anon, authenticated;",
    );
    expect(migration).toContain(
      "revoke all on function public.link_admin_user(text) from public, anon, authenticated;",
    );
  });

  it("never trusts a stored session without normalising it first", () => {
    const store = sources.find((file) => file.path.endsWith("lib/store.tsx"));
    expect(store).toBeDefined();
    // A raw read of a session written by an older build is what turned a signed
    // in branch into "Account not linked yet".
    expect(store!.text).toContain("normalizeSession(readJSON(DEMO_SESSION_KEY))");
    expect(store!.text).not.toContain("stored ?? null");
  });
});

describe("production debugging", () => {
  it("strips console output in production builds", () => {
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    expect(config).toContain("removeConsole");
    expect(config).toContain("productionBrowserSourceMaps: false");
  });

  it("routes logging through the redacting logger", () => {
    expect(offenders(/console\.(log|debug|info)\s*\(/, ["src/lib/log.ts"])).toEqual([]);
  });
});
