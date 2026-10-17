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
| `/dashboard` | branch + admin | File the day's report, history, debt ledger, offline sale reminders |
| `/admin` | admin only | Cross-branch totals, trend, missing days, open and review any report, void a report, manage branches and staff invites |

## Reviewing a day

Admins open any filed report — any branch, any date — from the report list in
`/admin`, see its section breakdown as shares of Total Sale, its line items with
per-category subtotals, and how the day compares with the branch's usual filed
day, the previous day and the last seven days. Each queue row also shows the
section mix and the reviewer trail inline, then either **tick it OK** or **flag a
concern** with a note. New reports start as `pending`, so the admin view always
shows a review queue; a flagged note is visible to the branch too. Reviewing
never edits a branch's numbers: `status` (active/voided) and the review state are
separate fields.

## Sales PDF export

The admin overview has an **Export sales report** card with three ranges —
*Weekly* (last 7 days), *Monthly* (this month to date) and *Custom* (two dates) —
scoped to the branch filter above it. The PDF (`src/lib/sales-pdf.ts`) contains
the daily bar chart with the best day highlighted, a six-month monthly bar
chart, best and lowest sale days with their share of the range, the section mix,
a branch breakdown, a day-by-day ledger that marks missing filings, and the
admin review status with every flagged concern. Voided reports are excluded and
called out in the header. `buildRangeSales` in `src/lib/sales-analytics.ts`
computes every figure once for both the preview and the PDF; best/lowest are
taken over filed days only so a missing report is never shown as the lowest sale.

## Offline sale reminders

The **Offline sale** add form sits directly below the *Others* section of the
daily report form, and the reminder list follows the form on the dashboard. It is
a reminder list, not a sale: an offline sale's money is already received as cash
or online, so its price is **never** added to Total Sale or to any report. Each
entry is an item name, a reference price and a date, plus a state — *Not added*
(still to be entered in the separate daily-sales system) or *Added* (someone has
entered it there). The admin overview shows the reminders alone as a review
queue, with a tick on each row that marks it added (and un-marks a mistaken
tick). The per-branch counts are derived from the documents rather than stored.

```
offlineSales/{id}  branchId, itemName, amountPaise, saleDate,
                   addedToSystem, addedAt, addedByName, createdAt
```

A branch login sees and writes only its own branch's reminders, exactly like
`debts`; an admin sees every branch.

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
| `offlineSales/{id}` | offline sale reminders: item, reference price, added-to-system state (never counted in Total Sale) |
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

## Adding a branch or a staff member

Both happen in `/admin` → *Branches & Staff Management*. A branch document holds
only a name, an active flag and the optional manager contact, and the rules
validate a *string* whenever an optional key is present — so `buildBranchDocument`
in `src/lib/report.ts` **omits** a blank manager field rather than writing `null`.
Sending `managerEmail: null` was refused outright, which is what made every
"Add Branch" press fail with nothing to show for it. The document id is the
slugified name, and a manager email is stored lower-cased because that is the
value both the rules and the manager lookup compare against.

An invitation addressed to an email is what links that account to a branch on
first sign-in, and an invitation with role `admin` grants admin rights (an invite
document can only be written by an admin, so this is an admin vouching for the
account). The invited account then records its own `admins/{uid}` grant, which an
admin can delete to revoke it. The invitee's first sign-in also flips their own
invitation to `active`, so the portal's Invited/Active badge tells the truth.

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
- jsPDF — vector PDF export (lazy-loaded from the admin page)
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
