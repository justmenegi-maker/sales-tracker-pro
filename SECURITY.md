# Security review — SK Tapri daily sales

A hardening pass over the app, run on 13 Oct 2026 against the checklist below.
Each row says what changed, where it is enforced, and what is still manual.

Run the checks that back this document with:

```bash
bunx tsc --noEmit && bun run lint && bun run test && bun run build
```

`src/lib/source-hygiene.test.ts` fails the test run if a pattern that was
removed here comes back (raw HTML, `eval`, string-built SQL, a non-public
`process.env` read in `src/`, tokens in localStorage, an unvalidated file
input, a `console.log`, or an env file that `.gitignore` stopped covering).

## Checklist

| # | Item | Status | Where |
| --- | --- | --- | --- |
| 1 | Enable RLS | Done (migration written, **not yet applied**) | `supabase/migrations/001_schema.sql`, `002_rls.sql`, `006_security_hardening.sql` |
| 2 | Tighten CORS | Done on our side; Supabase is service-managed | `public/_headers`, `SECURITY.md` §Hosting |
| 3 | Parameterised SQL | Done | every read/write via supabase-js; guard test; 006 uses no dynamic SQL |
| 4 | Verify email address | Done | `src/lib/supabase.ts`, `src/lib/store.tsx`, `src/app/auth/login/page.tsx` |
| 5 | Keep tokens out of local storage | Done | `src/lib/auth-storage.ts`, `src/lib/supabase.ts` |
| 6 | Hide `.env` files from git | Partial — see §Known gaps | `.gitignore` |
| 7 | Validate form inputs | Done | `src/lib/validation.ts` + store/form callers + DB constraints in 006 |
| 8 | Protect admin routes | Done | `src/components/require-auth.tsx`, role checks in `src/lib/store.tsx`, RLS |
| 9 | Disable production debugging | Done | `next.config.ts` |
| 10 | Server-side API secrets | Done | `src/lib/supabase.ts`, guard test, §Secrets |
| 11 | Rate limit requests | Done (defence in depth) | `src/lib/security.ts` + triggers in 006 + Supabase Auth |
| 12 | Validate file uploads | No upload surface; rule + helper in place | `src/lib/validation.ts` |
| 13 | Keep sensitive data out of logs | Done | `src/lib/log.ts`, eslint `no-console` |
| 14 | Harsh password security | Done | `src/lib/password.ts`, `src/components/security-panel.tsx` |
| 15 | Verify webhook signatures | Not applicable — no webhooks (§Webhooks) | — |
| 16 | Permissions | Done (migration written, **not yet applied**) | `supabase/migrations/006_security_hardening.sql` |
| 17 | Block cross-site scripting | Done | eslint rules, guard test, CSP in `public/_headers` |
| 18 | Update dependencies | Done for minors; majors deferred (§Dependencies) | `package.json`, `package-lock.json` |
| 19 | Anthropic vibe-code security review | Workflow added — needs the API key | `.github/workflows/security-review.yml` |

## 1 + 16. Row-level security and permissions

`006_security_hardening.sql` (idempotent, run last) does the following.

- Re-enables RLS on `branches`, `profiles`, `daily_reports`, `report_lines`,
  `debts` and `debt_payments`, and **revokes all table privileges from `anon`**,
  so the publishable key can reach the auth endpoints and nothing else.
- Adds `is_admin()` / `current_branch_id()` as `SECURITY DEFINER` helpers with a
  fixed `search_path`, so a policy on `profiles` never reads `profiles` through
  RLS itself.
- Replaces the old `profiles` policies. Before, `select using (true)` exposed the
  whole staff list to any signed-in user, and `update using (auth.uid() = id)`
  let a branch user rewrite their own `role` to `admin`. Reads are now
  self/own-branch/admin, and a `guard_profile_update` trigger freezes `role`,
  `branch_id` and `is_active` for non-admins. Self-insert is limited to an
  active `branch` profile inside an existing branch.
- Makes filed reports append-only: `guard_daily_report_update` rejects any update
  that moves the branch, date, submitting user, or any amount/total, and refuses
  to reactivate a voided report. A new report must insert as `active` +
  `pending`, so a client cannot pre-approve its own submission.
- Revokes `delete` on `daily_reports` and `report_lines`, and adds no delete
  policy, so history cannot be removed through the API at all.
- Adds `guard_debt_payment_amount`, which refuses a payment that exceeds what is
  still owed or that targets a voided debt.
- Bounds every value the browser can send (`daily_reports_cash_paise_range`,
  `daily_reports_report_date_sane`, `report_lines_label_len`,
  `debts_product_name_len`, `debt_payments_amount_positive`, …).

`007_trusted_maintenance.sql` (also idempotent) corrects one line of 006 and
adds the missing setup step.

- `guard_profile_update` now returns early when `auth.uid()` is null, the same
  convention `enforce_write_rate_limit` already used. A request with no JWT is
  not a browser — it is the SQL editor, a migration or the service role, which
  bypass row-level security anyway. Before this, the documented way to link a
  new branch login failed with "Only an admin can change role, branch or active
  state", leaving the login unlinked and therefore unable to file a report.
  A signed-in caller keeps exactly the protection it had: a branch user still
  cannot move their own role, branch or active state, and only an admin can move
  anyone's.
- `link_branch_user(email, branch)` / `link_admin_user(email)` create or repair
  that `profiles` row by email, idempotently. They are `security definer` and
  **revoked from `public`, `anon` and `authenticated`**, because Supabase grants
  `EXECUTE` to new functions by default and an RPC-reachable version would let
  any visitor promote themselves to admin.

Not done deliberately: `force row level security` is not set, because
`supabase/seed.sql` and maintenance run as the table owner without a JWT and
would be blocked. RLS plus the `anon` revoke is the boundary for the API.

## 2. CORS and security headers

The app is a static export (`output: "export"`): it has no server, so it emits
no CORS headers of its own and there is nothing in the repository that sets
`Access-Control-Allow-Origin` (verified). Two things matter instead:

1. **Supabase Auth → URL Configuration.** Set the Site URL and add only your own
   origins to the redirect allow list. That is the control that stops another
   site from using your project as a login redirect.
2. **Host headers.** `public/_headers` is copied into `dist/` and is served by
   hosts that support the convention (Cloudflare Pages, Netlify, and anything
   else reading `_headers`). It sets CSP, `X-Content-Type-Options`,
   `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
   `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy` and HSTS. A host
   that ignores the file needs the same set configured in its dashboard — this
   is the one item that cannot be fixed from inside the repository.

The CSP allows `'unsafe-inline'` for scripts and styles because a Next static
export inlines its hydration payload and critical CSS; `connect-src` is limited
to this origin plus `*.supabase.co`.

## 3. Parameterised SQL

Every database access goes through the supabase-js query builder
(`.from().select().eq()`), which sends values as bound parameters through
PostgREST — no value is ever concatenated into SQL text. The guard test rejects
any `${...}` interpolation within 60 characters of a SQL keyword, and rejects
`.rpc("`…`)``. None of the SQL in `supabase/migrations/` uses `execute format`
or another dynamic statement; the trigger functions use static statements with
`auth.uid()` and `declare` variables.

## 4. Email verification

- `signIn` refuses a session when Supabase reports `email_not_confirmed`, signs
  the partial session out, and shows a "resend confirmation email" action.
- Session restore (`resolveSupabaseSession`) applies the same check, so a token
  issued before the address was confirmed cannot be replayed in. The gate is
  `providerVerifiedEmail()`: a confirmation timestamp passes, and so does an
  OAuth provider (Google signs the `email_verified` claim), because Supabase does
  not guarantee an `email_confirmed_at` stamp for provider sign-ins.
- `RequireAuth` treats a session without `emailVerified` as signed out.
- Manual step: keep **Authentication → Providers → Email → Confirm email** on.
  The client check is a second line; Supabase is what actually blocks the
  password grant.

## 5. Tokens and session storage

`src/lib/auth-storage.ts` gives supabase-js a `sessionStorage` + memory adapter,
so the access/refresh tokens are gone when the tab closes and never land in
localStorage. `purgeLegacyAuthStorage()` deletes `sb-*-auth-token` keys that
older builds left in localStorage, and it also runs on sign-out. `supabase.ts`
sets `detectSessionInUrl: false` (a token is never read from the address bar,
and therefore never leaks via `Referer`) and `flowType: "pkce"`. Signing out
clears the tab; "Sign out on all devices" uses `scope: "global"`.

Trade-off worth knowing: because the session is tab-scoped, a refresh in a new
tab asks for the password again. That is the price of not leaving a refresh
token behind in localStorage.

A *stored* session is read back through `normalizeSession()`
(`src/lib/session.ts`), which fills in fields an older build did not write
(`hasProfile`, `isActive`, `signInProvider`, `emailVerified`). Without that, a
demo login saved before those fields existed came back as "Account not linked
yet" — i.e. a branch that could not reach its own report form after an update.
The permissive default is deliberate: only the database may say an account is
switched off, and `isActive: false` is then carried in from `profiles.is_active`.

## 5b. Google sign-in (OAuth)

Added after the hardening pass; it follows the same rules.

- **No tokens in the URL.** `detectSessionInUrl` stays **off**, so nothing in the
  app accepts a session from the address bar. The callback route
  (`src/app/auth/callback/page.tsx`) reads only the single-use PKCE `code`,
  exchanges it with `exchangeCodeForSession`, and immediately
  `history.replaceState`s the query string away before the session resolves.
- **Tokens in the URL are treated as an attack.**
  `readOAuthCallback()` ignores `access_token`, `refresh_token`,
  `provider_token` and `code_verifier` entirely, and a test asserts that a
  callback carrying them yields no code and no token in the parsed result.
- **The redirect target is this origin only.** `buildOAuthRedirect()` refuses a
  non-https origin (localhost excepted), always pins the path to
  `/auth/callback`, and only appends an internal `returnTo` — never an absolute
  URL, and never a path that would loop back into the callback.
- **The code verifier needs durable storage.** PKCE only works if the verifier
  survives the round trip, which is why `persistSession: true` and the
  sessionStorage adapter in `src/lib/auth-storage.ts` are required here. Both are
  also asserted by `src/lib/source-hygiene.test.ts`, so removing them fails the
  test run. The verifier key (`sb-…-auth-token-code-verifier`) is deliberately
  *not* matched by the legacy-token purge.
- **An unlinked account is a dead end, not a data leak.** A Google sign-in can
  create an auth user nobody has linked: `RequireAuth` then shows "Account not
  linked yet" instead of a workspace, and the database would return nothing
  anyway under RLS.
- **Password controls are hidden for provider accounts** (`signInProvider`), so
  a Google user is never offered a password change that cannot work.
- **Manual steps:** allow-list `https://<your-site>/auth/callback` in Supabase
  (Authentication → URL Configuration) — that allow list is what stops another
  site from being used as the redirect target — and set Google's authorized
  redirect URI to the **Supabase** callback
  (`https://<project-ref>.supabase.co/auth/v1/callback`), not to this app.
  Full steps: `supabase/INSTRUCTIONS.md` §3.

## 6. Environment files and git

`.gitignore` now covers `.env`, `.env.*`, `.env.keys`, `*.env`, `*.env.*`,
`supabase/.env*` and `supabase/env.local`, while still allowing a documented
`*.env.example`. Verified with `git status --porcelain`: no env file appears as
untracked, so anything created from here on stays out of the repository.

**Known gap (needs a human with git/UI access):** two env files are already
tracked in the repository — `.env.keys` and the stale root `.env.example`. My
tooling is blocked from reading, editing or untracking env files, so I could not
remove them. Please:

```bash
git rm --cached .env.keys          # keeps the working-tree copy, drops it from git
```

then **rotate every value that was in `.env.keys`** — the contents are already
in the history of earlier commits, so removing the file does not un-publish the
values. Root `.env.example` should be replaced with the Supabase/Next keys
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_APP_TIMEZONE`, `NEXT_PUBLIC_SITE_URL`); `supabase/env.example`
already documents them.

## 7. Input validation

`src/lib/validation.ts` is the single place that checks browser input:
`sanitizeText` (control characters stripped, whitespace collapsed, length
clamped), `isIsoDate` / `isSaneReportDate`, `isValidEmail`,
`validateCredentialFields`, `validateReportInput`, `validateDebtPayment`,
`validateManualDebt`, `validateReview`, `validateVoidReason`, `safeReturnPath`
and `validateUploadFile`. The store calls them before every write, the forms
call them before the store, and migration 006 repeats the same bounds as
database constraints — so a hand-rolled request that skips the UI still cannot
store a negative amount, a future date or a 10 kB label.

## 8. Admin routes

`/admin` is wrapped in `<RequireAuth role="admin">`, which now:

- redirects to `/auth/login?returnTo=…` when there is no usable session,
- redirects a branch user to `/dashboard` (the "Admin access only" card remains
  as the explanation of what just happened),
- refuses a demo session while Supabase is connected (demo sign-in is also
  disabled in that mode, and `signInDemo` refuses outright),
- refuses an unverified email.

The store additionally rejects `voidReport` and `setReportReview` from a
non-admin, and rejects a branch filing for another branch. None of that is the
security boundary: the RLS policies and the append-only trigger are, so a
tampered client gains nothing.

## 9. Production debugging

`next.config.ts`: `removeConsole` is on for production builds except for
`warn`/`error` (which the redacting logger uses), `productionBrowserSourceMaps`
is `false`, and `poweredByHeader` is `false`.

Verified on a real build: no `.map` files are emitted, and no `console.log`
from application code survives — the only remaining `console.log` calls in
`dist/` come from the prebuilt supabase-js realtime client, which SWC does not
transform. They print that library's own internal messages, not app data.

## 10. Server-side secrets

- Only `NEXT_PUBLIC_*` values reach the browser. A guard test fails the build if
  any other `process.env.*` read appears under `src/`.
- `isBrowserSafeKey()` refuses to start the client when the configured key is a
  `service_role` JWT or an `sb_secret_` key, so a service-role key pasted into
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` cannot silently ship to visitors. The URL must
  be `https` (or localhost).
- Verified in the built bundle: the only `service_role` occurrence is the
  comparison inside that guard.
- This app has no server, so it never needs `SUPABASE_SERVICE_ROLE_KEY`. Keep it
  in Supabase Edge Functions or another server; never give it a `NEXT_PUBLIC_`
  prefix.

## 11. Rate limiting

Three layers, because a static client cannot be the authority:

- **Supabase Auth** rate-limits sign-in and email sending on the server. Tune it
  in Authentication → Rate limits.
- **Postgres triggers** (`enforce_write_rate_limit`): 20 report inserts per
  minute per user, 60 debt inserts, 60 payments. `auth.uid()` is null for the
  service role and for the SQL editor, so maintenance is unaffected.
- **Browser** (`src/lib/security.ts`): 5 sign-in attempts per account per 5
  minutes, 30 writes per user per minute, with a clear "try again in Ns"
  message. This one is a UX guard — the two above are the enforcement.

## 12. File uploads

There is no upload surface: no `type="file"` input, no `storage.from(...)` call
anywhere in `src/` (checked by a guard test that also fails if a file input is
added without validating it). `validateUploadFile` records the rule for when one
is needed: JPEG/PNG/WebP/PDF only, extension must match the declared MIME type,
≤ 5 MB, no control characters, no `/`, `\` or `..` in the name. A future bucket
also needs its own storage RLS policy plus a size/MIME restriction on the bucket
itself, since the browser cannot enforce any of this.

## 13. Logging

`src/lib/log.ts` is the only module allowed to touch the console (eslint
`no-console` allows `warn`/`error` elsewhere but nothing else, and the logger
file is the documented exception). It runs every message through
`redactSensitive` / `redactRecord`, which strip JWTs, `sbp_`/`sk-` keys, bearer
values, email addresses (domain kept), phone numbers and long opaque strings.
The store logs an error *code* rather than a driver message, and messages shown
to users go through `safeErrorMessage`, which redacts and truncates.

## 14. Password policy

`src/lib/password.ts`: at least 12 characters and at most 72 bytes (the bcrypt
limit Supabase uses), one of each character class, no spaces, no three-character
repeats or sequences, no keyboard walks (`qwerty`, `asdf`), nothing from a
common-password list (compared both raw and stripped of punctuation), and not
your email local part, your display name, the product name or the word
"password". `passwordStrength` drives the meter.

The dashboard's **Account & security** panel applies it before changing a
password: it re-authenticates with the current password, validates the new one
against the policy, calls `updateUser`, then signs the other sessions out.

Manual step: set the same rule in Supabase (Authentication → Providers → Email →
minimum password length and strength) and, if your plan allows, turn on
leaked-password protection. A new branch login is created by an admin, so an
invited user sets their own password through the same policy path.

## 15. Webhooks

Not applicable: this app has no webhook endpoint, no server and no third-party
webhook provider. If one is added, it must be a Supabase Edge Function (this
repository's static export cannot host it) that:

1. reads the **raw** body before parsing,
2. recomputes the HMAC over it with the provider's signing secret and compares
   in constant time,
3. rejects unknown event types and replays (timestamp tolerance + event id),
4. writes with the service-role key only from that server context.

Never verify a signature in the browser: the secret would be public and the
body could be edited before the check.

## 17. Cross-site scripting

- No `dangerouslySetInnerHTML`, `document.write`, `eval`, `new Function` or
  string `setTimeout` in `src/` — enforced by eslint (`react/no-danger`,
  `no-eval`, `no-implied-eval`, `no-new-func`) and by the guard test.
- All dynamic text is rendered through React, which escapes it, and everything
  stored has already been through `sanitizeText`.
- `_headers` sets a CSP; `require-auth` and the login page only accept internal
  `returnTo` paths (`safeReturnPath`), so nothing can bounce a user off-site.
- External links use `rel="noopener noreferrer"`.

## 18. Dependencies

Updated (minor, no API changes): `@supabase/supabase-js` 2.49 → 2.117,
`react`/`react-dom` 19.0 → 19.3, `@types/react`/`@types/react-dom` 19.0 → 19.3,
`tailwind-merge` 3.0 → 3.7, `prettier` 3.4 → 3.9. `next` and
`eslint-config-next` were `"latest"` and are now pinned to `^16.4.0`, so a build
cannot silently jump majors. `package-lock.json` (the tracked lockfile) was
regenerated.

Deferred, on purpose — each is a breaking major that deserves its own change and
regression pass: `typescript` 5 → 7, `eslint` 9 → 10, `vitest` 2 → 5,
`lucide-react` 0.514 → 1.x, `sonner` 1.7 → 2.x, `@types/node` 22 → 26,
`prettier-plugin-tailwindcss` 0.6 → 0.8. Re-run `bunx npm-check-updates` and take
them one at a time with the checks above.

## 19. Anthropic security review

`.github/workflows/security-review.yml` runs
`anthropics/claude-code-security-review` on every pull request and posts its
findings as a review comment. Add a repository secret named `ANTHROPIC_API_KEY`
(Settings → Secrets and variables → Actions) — the key must be enabled for the
Claude API and Claude Code — then the next PR gets the review automatically.

Anthropic's own caution applies: the action is not hardened against prompt
injection, so keep it to trusted PRs and require approval for fork
contributions. For a reproducible workflow, replace `@main` with a pinned commit
SHA.

## Known gaps and limitations

- **Migrations 006 and 007 have not been executed anywhere.** There is no
  Postgres in this sandbox; the SQL is written and reviewed but unapplied. Run
  001–007 in the Supabase SQL editor, in filename order, then `seed.sql`.
- **No browser here**, so the interactive paths (sign in, file a report, save a
  review, change a password) are covered by type checks, unit tests and route
  checks against the built app, not by a scripted click-through.
- **`.env.keys` is still tracked** and the stale root `.env.example` still needs
  replacing — both need manual git/UI access, see §6.
- **Host headers and Supabase Auth settings are manual**, see §2 and §4.
- **Client rate limits are bypassable** by design; the database triggers and
  Supabase Auth limits are the real fence (§11).
- **`src/lib/security.ts` and `src/lib/validation.ts` are pure modules with
  unit tests**; they have no server-side twin, because the app has no server.
