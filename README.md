# SK Tapri — Daily Sales Report

Branch daily sales reporting for SK Tapri, in INR.

**Total Sale = Cash + Online + Finance + Debt + Exchange + Cheque + Store use + Others**

Every amount is stored as integer paise (`src/lib/money.ts`), and the total is
recomputed from the sections in one place (`src/lib/totals.ts`) so the browser
and the database can never disagree.

## Routes

| Route | Who | What |
| --- | --- | --- |
| `/` | public | Landing page; signed-in staff are sent straight to their workspace |
| `/auth/login` | public | Firebase sign-in — Google (Gmail) or email/password |
| `/dashboard` | branch + admin | File the day's report, history, debt ledger |
| `/admin` | admin only | Cross-branch totals, trend, missing days, open and review any report, void a report, manage branches and staff invites |

## Reviewing a day

Admins open any filed report — any branch, any date — from the report list in
`/admin`, see its sections and line items, then either **tick it OK** or **flag a
concern** with a note. New reports start as `pending`, so the admin view always
shows a review queue; a flagged note is visible to the branch too. Reviewing
never edits a branch's numbers: `status` (active/voided) and the review state are
separate fields.

The app is exported statically (`next.config.ts` → `output: "export"`, `distDir: "dist"`),
so routes are guarded in the browser by `src/components/require-auth.tsx`.

## Data layer

Firebase, entirely in the browser. `src/lib/firebase.ts` initialises the app from
the checked-in web config (`firebase-applet-config.json`) and exports the Auth
and Firestore handles; `src/lib/store.tsx` is the single source of truth for the
UI and subscribes with `onSnapshot`, so a report filed on one phone shows up on
the others without a reload.

| Collection | Holds |
| --- | --- |
| `users/{uid}` | profile, role (`admin` / `branch`) and the assigned `branchId` |
| `admins/{uid}` | extra admin grant, read by the security rules |
| `branches/{id}` | branch name, active flag, optional manager email |
| `reports/{id}` | one filed day: cash + online amounts, line items, review state |
| `debts/{id}` | credit sales and their payments |
| `invites/{email}` | staff invitations; the invite assigns the branch on first sign-in |

## Roles

A session is resolved in `src/lib/store.tsx` on every auth change:

- **Admin** — the auth uid has an `admins/{uid}` document, or the account is the
  bootstrap admin email. Admins read and write every branch.
- **Branch staff** — a `users/{uid}` profile with `role: "branch"` and a
  `branchId`. The invite document for the signed-in email (or a branch whose
  `managerEmail` matches) supplies that `branchId` on first sign-in.

`firestore.rules` is the authorisation boundary, not the UI: a branch login can
read and file reports and debts only for its own branch, only an admin can change
a report's review state or void it, a branch can add payments to its own debts
but cannot edit the amount owed, and everything not matched is denied.

Branch names are the one exception — any signed-in staff member may read them,
plus the branch's manager contact. A query has to be provably allowed for every
document it could return (rules are not filters), so scoping branch reads to the
caller's own branch denied the whole `branches` read for a branch login and left
the report form with no branch to file for. `firebase.json` points the Firestore
deploy at that file:

```bash
firebase deploy --only firestore:rules
```

## Environment

| Key | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_TIMEZONE` | optional | Defaults to `Asia/Kolkata`; decides what "today" means |
| `NEXT_PUBLIC_SITE_URL` | optional | Public site URL |

Firebase credentials are not environment variables: the browser web config lives
in `firebase-applet-config.json`, which is checked in. Set anything you add in
the workspace environment (Settings → Environment). Never commit keys.

## Tech

- Next.js (App Router, static export) + React 19
- Firebase 13 — Authentication + Cloud Firestore
- Tailwind v4 (PostCSS plugin in `postcss.config.mjs`, theme tokens in `src/app/globals.css`)
- shadcn/ui-style primitives in `src/components/ui`
- Vitest for the money/totals/report logic

## Commands

- Install: `bun install`
- Dev: `bun run dev` (binds `0.0.0.0`, on `PORT` or 5173)
- Build (static export to `dist/`): `bun run build`
- Typecheck: `bunx tsc --noEmit`
- Test: `bun run test`
- Lint: `bun run lint`

## Remote

- `https://github.com/justmenegi-maker/sales-tracker-pro.git`
