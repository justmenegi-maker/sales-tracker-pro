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
| `/dashboard` | branch + admin | File the day's report, history, debt and advance ledgers, offline sale reminders |
| `/admin` | admin only | Cross-branch totals, trend, missing days, open, review, correct or void any report, manage branches and staff invites, advance ledger |

## Description box

The daily report form has an optional **Description / note** box (1,000
characters). It is stored as `note` on the report, shown in the report row, in
the report sheet as *Description / note*, and listed in the PDF export as a
**Daily notes** section, so the reason behind a day never lives only in someone's
head.

## Expenses (money out)

An **Expense** section sits directly above *Others* in the daily report form, for
money the shop paid out that day (electricity, repairs, tea). Expense rows are
stored as ordinary `lines` with `category: "expense"`, but they are the one
category that is **never** added to Total Sale: the form shows the running
total, the expense subtotal and the resulting **Net in hand** separately. The
report sheet shows the same split, and voiding a report removes its expenses
from every total with it. The admin overview's *Expense in range* tile sums the
active reports in the selected range, and the PDF export lists expenses and net
in hand below the section mix — clearly marked as outside Total Sale.

## Advance ledger

Money a customer pays before the item is handed over lives in its own ledger
(`advances/{id}`) and stays **out of Total Sale while it is held**. It is counted
exactly once, on the day it is added to a sale — that day's Total Sale includes
it, so the money is never counted twice and never lost. Each entry carries the
customer, the item, the amount, the received date and an optional note. The
entry form sits directly below the **Finance** section of the daily report form;
the ledger itself follows the report and debt ledgers on the dashboard, and the
admin portal keeps its own entry form.

- **Add to sale** records the sale date the advance belongs to (`appliedOn`) and
  **adds the amount to that day's Total Sale** — on the branch's daily tiles, the
  admin KPIs, the trend charts and the exported PDF. A toast confirms the amount
  and the day it landed on. Advances belong to the branch's day, not to one
  report, so two reports on the same date still count the advance once, and the
  report sheet for that day says how much of the day's sale came from advances.
- **Refund** appends a refund row (`refunds[]`) with amount, date and reason;
  partial refunds leave the rest held, and the full amount can never be refunded
  twice.
- Status is derived, never stored: `open` while held, `applied` after it is
  added to a sale, `refunded` once it is returned in full.

An admin sees every branch's advances; branch staff see and write only their own.
The rules let a branch update only `appliedOn`, `appliedByName` and `refunds`
after the entry exists, so the customer, item and amount cannot be rewritten from
a branch login.

## Debt due dates

Every debt row in the debt ledger carries an editable **Due date** column. A new
manual debt can be given a due date in the add form, and a debt created from a
report's debt line gets one later from its row. A debt whose due date has passed
while money is still owed is labelled **Overdue**; cleared or voided debts never
are. The due date is optional and stored as `dueDate` (or omitted when blank).

## Correcting a filed report

Branch staff still cannot edit a filed report. An admin opens the report from the
review queue and presses **Edit**: date, cash, online, line items and the note
become editable, and Saving stamps `editedByName` / `editedAt` on the report.
The totals are recomputed before the save and non-numeric or negative amounts are
refused. Debt rows in the debt ledger are separate documents, so the correction
reconciles them in the same write: a changed amount or date updates the entry
and keeps the payments already recorded against it, a debt row changed into
another category voids the entry, and a newly added debt row creates one. When a
removed entry already has payments, the admin sees each entry and must tick a
confirmation before the save is allowed.

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

## Voiding a report

Voiding is a soft delete: the report keeps its `voided` status and the reason,
so it stays readable in the admin audit view while dropping out of every total
and chart. The debt entries the report created are voided in
the same write, so a voided day cannot leave money owed behind in the ledger. If
one of those entries already has a payment, the admin first sees a warning
naming the collected amount and has to press **Void anyway** to confirm; the
payments themselves stay on the entry for the audit trail.

## Sales PDF export

The admin overview has an **Export sales report** card with three ranges —
*Weekly* (last 7 days), *Monthly* (this month to date) and *Custom* (two dates) —
scoped to the branch filter above it. The PDF (`src/lib/sales-pdf.ts`) contains
the daily bar chart with the best day highlighted, a six-month monthly bar
chart, best and lowest sale days with their share of the range, the section mix plus
expenses and net in hand, a branch breakdown, a day-by-day ledger that marks missing filings, and the
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
| `reports/{id}` | one filed day: cash + online amounts, line items, note, review state, admin correction trail |
| `debts/{id}` | credit sales, their payments and an optional collection due date |
| `advances/{id}` | advance money held, the sale date it was applied to, and refunds |
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
