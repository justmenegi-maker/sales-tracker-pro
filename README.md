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
| `/auth/login` | public | Supabase email/password sign-in, plus demo entry |
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
