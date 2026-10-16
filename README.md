# SK Tapri — Daily Sales Report

Branch daily sales reporting for SK Tapri, in INR.

**Total Sale = Cash + Online + Finance + Debt + Exchange + Cheque + Store use + Others**

Every amount is stored as integer paise (`src/lib/money.ts`), and the total is
recomputed from the sections in one place (`src/lib/totals.ts`) so the browser
and the database can never disagree.

## Routes

| Route | Who | What |
| --- | --- | --- |
| `/` | public | Landing page |
| `/auth/login` | public | Supabase email/password sign-in and **Continue with Google**, plus demo entry |
| `/auth/callback` | public | Google's return trip: exchanges the one-time PKCE code for a session |
| `/dashboard` | branch + admin | File the day's report, history, debt ledger |
| `/admin` | admin only | Cross-branch totals, trend, missing days, open and review any report, void a report |

## Reviewing a day

Admins open any filed report — any branch, any date — from the report list in
`/admin`, see its sections and line items, then either **tick it OK** or **flag a
concern** with a note. New reports start as `pending`, so the admin view always
shows a review queue; a flagged note is visible to the branch too. Reviewing
never edits a branch's numbers: `status` (active/voided) and the review state are
separate columns.

The app is exported statically (`next.config.ts` → `output: "export"`, `distDir: "dist"`),
so routes are guarded in the browser by `src/components/require-auth.tsx`.

## Two run modes

The app picks a mode at runtime, based on the environment:

- **Supabase mode** — when `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are both set. Real auth, real tables, RLS enforced.
  Sign-in is email/password or Google (see `supabase/INSTRUCTIONS.md` §3).
- **Demo mode** — when they are not. A seeded workspace (two branches, three
  weeks of reports, a debt ledger) is generated in `src/lib/demo-data.ts` and
  persisted to `localStorage`, so the whole product can be explored before a
  Supabase project exists.

## Environment

| Key | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | for live data | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for live data | Safe for the browser; RLS enforces access |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Server-only; needed for admin branch-user creation |
| `NEXT_PUBLIC_APP_TIMEZONE` | optional | Defaults to `Asia/Kolkata`; decides what "today" means |
| `NEXT_PUBLIC_SITE_URL` | optional | Public site URL |

Set these in the workspace environment (Settings → Environment). Never commit keys.

## Database setup

Run the SQL in `supabase/migrations/` in filename order in the Supabase SQL
editor, then `supabase/seed.sql` for sample branches. `supabase/INSTRUCTIONS.md`
walks through the full setup.

- 004 grants signed-in users read access to branch names, which the report form needs.
- 005 adds the admin review columns (`review_status`, `review_note`, `reviewed_by`, `reviewed_at`). The app falls back to reading without them if the migration has not run yet.
- 006 is the security pass: hardened policies, no table access for `anon`,
  append-only filed reports, bounded inputs and per-user write rate limits.
- 007 lets trusted maintenance (the SQL editor) link a login to its branch and
  adds the `link_branch_user` / `link_admin_user` helpers. Run it after 006 —
  without a linked profile a branch login can file nothing.

A branch login only works once its `profiles` row points at a branch:
`select public.link_branch_user('kaza@sktapri.app', 'SK Kaza')`. See
`supabase/INSTRUCTIONS.md` §4.

## Security

The hardening pass — what is enforced where, the manual steps that live in the
Supabase dashboard, and the known gaps — is written up in `SECURITY.md`. In
short:

- Row-level security and the append-only/review triggers are the boundary; the
  route guard, the input validation in `src/lib/validation.ts` and the rate
  limiter in `src/lib/security.ts` are the friendly layers in front of it.
- Only publishable keys belong in the browser. A service-role key is refused at
  startup, and a test fails the build if a non-`NEXT_PUBLIC_` variable is read
  under `src/`.
- Sessions live in `sessionStorage` plus memory, never in localStorage, and the
  password policy in `src/lib/password.ts` is enforced by the Account &
  security panel on the dashboard.
- `public/_headers` carries the CSP and the other response headers for hosts
  that serve it; the Supabase redirect allow list is configured in the
  dashboard.
- Pull requests get an automated review from
  `.github/workflows/security-review.yml` once `ANTHROPIC_API_KEY` is set as a
  repository secret.

## Tech

- Next.js (App Router, static export) + React 19
- Supabase JS (`@supabase/supabase-js`)
- Tailwind v4 (PostCSS plugin in `postcss.config.mjs`, theme tokens in `src/app/globals.css`)
- shadcn/ui-style primitives in `src/components/ui`
- Vitest for the money/totals logic

## Commands

- Install: `bun install`
- Dev: `bun run dev`
- Build (static export to `dist/`): `bun run build`
- Typecheck: `bunx tsc --noEmit`
- Test: `bun run test`
- Lint: `bun run lint`

## Remote

- `https://github.com/justmenegi-maker/sales-tracker-pro.git`
