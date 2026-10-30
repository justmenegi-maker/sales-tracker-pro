/**
 * Domain model for the SK Tapri daily sales report.
 *
 * This mirrors the Firestore shape enforced by `firestore.rules`:
 *  - a `reports` document keeps cash + online as fields and the rest as lines
 *  - every line carries its category (finance / debt / exchange / cheque /
 *    store_use / expense / others) instead of living in its own collection
 *  - `expense` is the one category that is money *out*: it is stored on the
 *    report and shown in its own section, but it never adds to Total Sale
 *  - a `debts` document holds its payments inline, which drives the debt ledger
 *
 * The client can always recompute a total from a report, and does so through
 * `lib/totals.ts` so the arithmetic lives in exactly one place.
 */
import { formatWeekdayShort } from "./format";
import { computeTotalSale } from "./totals";
import type { ReportSection } from "./totals";

export type LineCategory =
  | "finance"
  | "debt"
  | "exchange"
  | "cheque"
  | "store_use"
  | "expense"
  | "others";

export type SectionKey = ReportSection;

export type ReportLine = {
  id: string;
  category: LineCategory;
  label: string;
  amountPaise: number;
};

export type Branch = {
  id: string;
  name: string;
  isActive: boolean;
  managerEmail?: string | null;
  managerName?: string | null;
  createdAt?: string;
};

export type StaffInvite = {
  id: string;
  email: string;
  displayName: string;
  branchId: string;
  branchName: string;
  role: "branch" | "admin";
  invitedBy?: string;
  status: "invited" | "active";
  createdAt: string;
};

/** Admin review of a filed report. */
export type ReviewStatus = "pending" | "ok" | "concern";

export type DailyReport = {
  id: string;
  branchId: string;
  branchName: string;
  reportDate: string;
  submittedBy: string;
  submittedByName: string;
  cashPaise: number;
  onlinePaise: number;
  lines: ReportLine[];
  status: "active" | "voided";
  /**
   * The shop did not open that day. A closed day is a notice to the admin, not a
   * sale: it carries no amounts, and it exists so the day reads as accounted for
   * instead of as a missing filing. Absent on documents filed before this field
   * existed, which read as open.
   */
  shopClosed?: boolean;
  voidReason: string | null;
  createdAt: string;
  /** Free-text note left by the person filing the day. */
  note: string | null;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  /** Set when an admin corrects a filed report. */
  editedByName: string | null;
  editedAt: string | null;
};

export type DebtPayment = {
  id: string;
  amountPaise: number;
  paidOn: string;
  note: string | null;
  /** Who recorded the payment. Absent on payments recorded before it existed. */
  recordedBy?: string | null;
  recordedByName?: string | null;
};

export type DebtStatus = "open" | "partial" | "cleared";

/** Money returned to a customer against an advance. */
export type AdvanceRefund = {
  id: string;
  amountPaise: number;
  refundedOn: string;
  note: string | null;
};

/**
 * An advance is money a customer pays before the item is handed over.
 *
 * It is tracked separately from a report's Total Sale: the cash arrived on the
 * advance date, so counting it again on the day of the full sale would double
 * it. `appliedOn` records the later date the advance was folded into a filed
 * sale, which is what lets the owner reconcile one day against another.
 */
export type Advance = {
  id: string;
  branchId: string;
  customerName: string;
  itemName: string;
  amountPaise: number;
  advanceDate: string;
  /** The sale date this advance was counted on; null while still held. */
  appliedOn: string | null;
  appliedByName: string | null;
  refunds: AdvanceRefund[];
  note: string | null;
  createdAt: string;
};

export type AdvanceStatus = "open" | "applied" | "refunded";

export type AdvanceInput = {
  branchId: string;
  customerName: string;
  itemName: string;
  amountPaise: number;
  advanceDate: string;
  note?: string | null;
};

export type Debt = {
  id: string;
  branchId: string;
  productName: string;
  amountPaise: number;
  debtDate: string;
  /** When the customer is expected to pay; null when nobody has set one. */
  dueDate: string | null;
  source: "report" | "manual";
  voided: boolean;
  payments: DebtPayment[];
};

/**
 * A reminder to enter an offline sale in the separate daily-sales system.
 *
 * `amountPaise` is the item price kept for reference only. The money for an
 * offline sale has already been received as cash or online, so this value is
 * never added to Total Sale — adding it again would double count the day.
 */
export type OfflineSale = {
  id: string;
  branchId: string;
  itemName: string;
  amountPaise: number;
  saleDate: string;
  addedToSystem: boolean;
  addedAt: string | null;
  addedByName: string | null;
  createdAt: string;
};

export type OfflineSaleInput = {
  branchId: string;
  itemName: string;
  amountPaise: number;
  saleDate: string;
};

export type SaveReportInput = {
  branchId: string;
  reportDate: string;
  cashPaise: number;
  onlinePaise: number;
  lines: Array<Pick<ReportLine, "category" | "label" | "amountPaise">>;
  note?: string | null;
  /** Mark the day as a closed-shop notice instead of a sale. */
  shopClosed?: boolean;
};

/** What an admin changes when correcting a filed report. */
export type ReportEditInput = {
  reportDate: string;
  cashPaise: number;
  onlinePaise: number;
  lines: Array<Pick<ReportLine, "category" | "label" | "amountPaise">>;
  note: string | null;
};

/** The eight sections shown on the entry form, in cash-book order. */
export const SECTION_META: Array<{
  key: SectionKey;
  label: string;
  hint: string;
}> = [
  { key: "cash", label: "Cash", hint: "Counter cash collected" },
  { key: "online", label: "Online", hint: "UPI, card, wallet" },
  { key: "finance", label: "Finance", hint: "Financed by a lender" },
  { key: "debt", label: "Debt", hint: "Goods taken on credit" },
  { key: "exchange", label: "Exchange", hint: "Old item exchanged" },
  { key: "cheque", label: "Cheque", hint: "Cheque payments" },
  { key: "store_use", label: "Store use", hint: "Owner / staff use" },
  { key: "others", label: "Others", hint: "Anything else" },
];

export const LINE_CATEGORY_META: Array<{
  key: LineCategory;
  label: string;
  hint: string;
}> = [
  { key: "finance", label: "Finance rows", hint: "Lender + amount" },
  { key: "debt", label: "Debt rows", hint: "Product + amount" },
  { key: "exchange", label: "Exchange", hint: "Item being exchanged" },
  { key: "cheque", label: "Cheque", hint: "Bank / cheque number" },
  { key: "store_use", label: "Store use", hint: "Reason" },
  {
    key: "expense",
    label: "Expense rows",
    hint: "Money spent — recorded but never added to Total Sale",
  },
  { key: "others", label: "Others", hint: "Description" },
];

export function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

/** Amount per section for a report: cash/online columns plus summed lines. */
export function sectionTotals(report: DailyReport): Record<SectionKey, number> {
  const totals: Record<SectionKey, number> = {
    cash: report.cashPaise,
    online: report.onlinePaise,
    finance: 0,
    debt: 0,
    exchange: 0,
    cheque: 0,
    store_use: 0,
    others: 0,
  };

  for (const line of report.lines) {
    // Expenses are money paid out, so they are kept off the Total Sale.
    if (line.category === "expense") continue;
    totals[line.category] += line.amountPaise;
  }

  return totals;
}

/** Every section at zero, for a day the shop was shut. */
const ZERO_SECTIONS: Record<SectionKey, number> = {
  cash: 0,
  online: 0,
  finance: 0,
  debt: 0,
  exchange: 0,
  cheque: 0,
  store_use: 0,
  others: 0,
};

/**
 * Whether the branch marked this day as one the shop was closed.
 *
 * Read through a helper so an older document without the field is never treated
 * as closed, and so nothing has to remember that the field is optional.
 */
export function isShopClosed(report: DailyReport): boolean {
  return report.shopClosed === true;
}

/** Total Sale for a report, computed through the shared totals module. */
export function reportTotalPaise(report: DailyReport): number {
  if (isShopClosed(report)) return 0;
  return computeTotalSale(sectionTotals(report));
}

/** Everything the day cost, summed from its expense rows. Never in Total Sale. */
export function reportExpensePaise(report: DailyReport): number {
  return report.lines
    .filter((line) => line.category === "expense")
    .reduce((sum, line) => sum + line.amountPaise, 0);
}

export function reportFinanceCount(report: DailyReport): number {
  return report.lines.filter((line) => line.category === "finance").length;
}
export function advanceRefundedPaise(advance: Advance): number {
  return advance.refunds.reduce((sum, refund) => sum + refund.amountPaise, 0);
}

/** Advance money still held: everything not yet applied to a sale or refunded. */
export function advanceHeldPaise(advance: Advance): number {
  if (advance.appliedOn) return 0;
  return Math.max(0, advance.amountPaise - advanceRefundedPaise(advance));
}

/**
 * The part of an advance that was folded into a sale: the amount minus any
 * refund given before it was applied. Zero while it is still held.
 */
export function advanceAppliedPaise(advance: Advance): number {
  if (!advance.appliedOn) return 0;
  return Math.max(0, advance.amountPaise - advanceRefundedPaise(advance));
}

/** Derived, so the ledger cannot disagree with its own refund rows. */
export function deriveAdvanceStatus(advance: Advance): AdvanceStatus {
  if (advanceRefundedPaise(advance) >= advance.amountPaise) return "refunded";
  if (advance.appliedOn) return "applied";
  return "open";
}

export function summarizeAdvances(advances: Advance[]): {
  heldPaise: number;
  appliedPaise: number;
  refundedPaise: number;
  openCount: number;
  appliedCount: number;
  refundedCount: number;
} {
  const summary = {
    heldPaise: 0,
    appliedPaise: 0,
    refundedPaise: 0,
    openCount: 0,
    appliedCount: 0,
    refundedCount: 0,
  };

  for (const advance of advances) {
    const status = deriveAdvanceStatus(advance);
    summary.refundedPaise += advanceRefundedPaise(advance);
    if (status === "refunded") {
      summary.refundedCount += 1;
      continue;
    }
    if (status === "applied") {
      summary.appliedCount += 1;
      summary.appliedPaise += advanceAppliedPaise(advance);
      continue;
    }
    summary.openCount += 1;
    summary.heldPaise += advanceHeldPaise(advance);
  }

  return summary;
}

/** Why an advance cannot be added to a sale, or null when it can. */
export function advanceApplyError(
  advance: Advance,
  appliedOn: string,
): string | null {
  if (deriveAdvanceStatus(advance) !== "open") {
    return "Only an advance that is still held can be added to a sale.";
  }
  if (!appliedOn) return "Pick the sale date this advance belongs to.";
  return null;
}

/** Why a refund cannot be recorded, or null when it can. */
export function advanceRefundError(
  advance: Advance,
  amountPaise: number,
): string | null {
  const status = deriveAdvanceStatus(advance);
  if (status === "applied") {
    return "This advance is already counted in a sale, so it cannot be refunded here.";
  }
  if (status === "refunded") {
    return "This advance has already been refunded in full.";
  }
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    return "Enter the amount being refunded.";
  }
  if (amountPaise > advanceHeldPaise(advance)) {
    return "The refund cannot be more than the advance still held.";
  }
  return null;
}

/**
 * Advances adjusted into a sale on `date`, so the report view can show the
 * amount that was received earlier but belongs to this day's sale.
 */
export function advancesAppliedOn(
  advances: Advance[],
  branchId: string,
  date: string,
): { count: number; totalPaise: number } {
  const applied = advances.filter(
    (advance) =>
      advance.branchId === branchId &&
      advance.appliedOn === date &&
      deriveAdvanceStatus(advance) === "applied",
  );
  return {
    count: applied.length,
    totalPaise: applied.reduce(
      (sum, advance) => sum + advanceAppliedPaise(advance),
      0,
    ),
  };
}

export function debtPaidPaise(debt: Debt): number {
  return debt.payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
}

export function debtOutstandingPaise(debt: Debt): number {
  return Math.max(0, debt.amountPaise - debtPaidPaise(debt));
}

/**
 * Why a payment cannot be recorded against this debt, or null when it can.
 *
 * A debt is never overpaid: collecting more than is owed would leave the
 * ledger showing "cleared" with more money in it than the debt ever was, and
 * the excess has nowhere to go — it is not a sale and not a debt.
 */
export function debtPaymentError(debt: Debt, amountPaise: number): string | null {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    return "Enter the amount received.";
  }
  const outstanding = debtOutstandingPaise(debt);
  if (outstanding <= 0) return "This debt is already paid in full.";
  if (amountPaise > outstanding) {
    return "The payment cannot be more than the amount still owed.";
  }
  return null;
}

/** Money still owed after its promised due date has passed. */
export function debtIsOverdue(debt: Debt, today: string): boolean {
  return Boolean(
    debt.dueDate &&
      !debt.voided &&
      debtOutstandingPaise(debt) > 0 &&
      debt.dueDate < today,
  );
}

/** Derived from the payments, never stored, so ledger and reports cannot disagree. */
export function deriveDebtStatus(debt: Debt): DebtStatus {
  const paid = debtPaidPaise(debt);
  if (paid >= debt.amountPaise) return "cleared";
  if (paid > 0) return "partial";
  return "open";
}

/**
 * Reminder counts for the offline-sale section.
 *
 * Deliberately outside `computeTotalSale`: the money already arrived as cash or
 * online, so the price on a reminder is reference data, not another sale.
 */
export function summarizeOfflineSales(sales: OfflineSale[]): {
  pending: number;
  added: number;
  pendingPaise: number;
  addedPaise: number;
} {
  const summary = { pending: 0, added: 0, pendingPaise: 0, addedPaise: 0 };
  for (const sale of sales) {
    if (sale.addedToSystem) {
      summary.added += 1;
      summary.addedPaise += sale.amountPaise;
    } else {
      summary.pending += 1;
      summary.pendingPaise += sale.amountPaise;
    }
  }
  return summary;
}

/** Reports for one branch + date, newest first. */
export function reportsForDate(
  reports: DailyReport[],
  branchId: string,
  reportDate: string,
): DailyReport[] {
  return reports.filter(
    (report) =>
      report.branchId === branchId &&
      report.reportDate === reportDate &&
      report.status === "active",
  );
}

/**
 * The branch a queued report belongs to.
 *
 * `branches` only holds what the Firestore listener has delivered so far, and a
 * branch login must not be blocked while that is still on the wire. The
 * assignment in the session (`branchId`, plus the branch name the invite
 * carried) is the pair the security rules compare a filed report against, so it
 * is authoritative for the caller's own branch. Anyone filing for a branch they
 * are not assigned to still has to pick it from the loaded list.
 */
export function resolveFilingBranch(input: {
  branchId: string;
  branches: Branch[];
  session: {
    role: "admin" | "branch";
    branchId: string | null;
    branchName?: string | null;
  } | null;
}): Branch | null {
  const { branchId, branches, session } = input;
  if (!branchId) return null;

  const loaded = branches.find((branch) => branch.id === branchId);
  if (loaded) return loaded;

  if (session?.role === "branch" && session.branchId === branchId) {
    return {
      id: branchId,
      name: session.branchName?.trim() || branchId,
      isActive: true,
    };
  }

  return null;
}

/** Document id for a branch, derived from its name. */
export function branchIdFromName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || makeId("branch")
  );
}

/**
 * Firestore payload for an admin correction of a filed report.
 *
 * A correction rebuilds the row set, so every line gets a fresh id and zeroed
 * rows are dropped. Amounts are rejected rather than silently coerced: a
 * correction that stored a negative or fractional paise value would break every
 * total derived from it.
 */
export function buildReportEditPayload(
  input: ReportEditInput,
  editorName: string,
  editedAt: string,
): { data: Record<string, unknown>; error: string | null } {
  const amounts = [
    input.cashPaise,
    input.onlinePaise,
    ...input.lines.map((line) => line.amountPaise),
  ];
  if (
    amounts.some(
      (amount) => !Number.isInteger(amount) || amount < 0,
    )
  ) {
    return { data: {}, error: "Every amount must be a non-negative number of rupees." };
  }

  if (!input.reportDate) {
    return { data: {}, error: "Pick the report date." };
  }

  const lines: ReportLine[] = input.lines
    .filter((line) => line.amountPaise > 0)
    .map((line) => ({
      id: makeId("line"),
      category: line.category,
      label: line.label.trim() || "Adjusted entry",
      amountPaise: line.amountPaise,
    }));

  return {
    data: {
      reportDate: input.reportDate,
      cashPaise: input.cashPaise,
      onlinePaise: input.onlinePaise,
      lines,
      note: input.note?.trim() ? input.note.trim() : null,
      editedByName: editorName,
      editedAt,
    },
    error: null,
  };
}

/**
 * The debt rows of a report, normalised for the ledger.
 *
 * Mirrors what filing writes to `debts`, so a correction and a filing can never
 * disagree about which rows should exist in the ledger.
 */
export function reportDebtRows(
  lines: Array<Pick<ReportLine, "category" | "label" | "amountPaise">>,
): Array<{ label: string; amountPaise: number }> {
  return lines
    .filter((line) => line.category === "debt" && line.amountPaise > 0)
    .map((line) => ({
      label: line.label.trim() || "Credit sale item",
      amountPaise: line.amountPaise,
    }));
}

/** What an admin correction does to the debt ledger. */
export type ReportDebtChange = {
  /** Ledger entries whose product, amount or date the correction rewrites. */
  updates: Array<{
    id: string;
    productName: string;
    amountPaise: number;
    debtDate: string;
  }>;
  /** Debt rows the correction keeps: they need a new ledger entry. */
  creates: Array<{ productName: string; amountPaise: number; debtDate: string }>;
  /**
   * Ledger entries the correction removes — a debt row changed into expense, or
   * dropped. They are voided, never deleted, so the money trail stays auditable.
   */
  voids: Array<{
    id: string;
    productName: string;
    amountPaise: number;
    paymentCount: number;
    paidPaise: number;
  }>;
};

function debtNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Reconciles the debt ledger with the debt rows of a corrected report.
 *
 * Without this, changing a debt row into an expense (or fixing its amount) left
 * the ledger holding the old debt, so the ledger and the day's Total Sale told
 * two different stories.
 *
 * Matching is generous but never arbitrary: a row is paired with a ledger entry
 * by product + amount first, then by amount alone, then by product alone, so a
 * corrected amount keeps the payments already recorded against that debt. A row
 * that matches nothing is created, and an entry that matches nothing is voided.
 */
export function planReportDebtSync(input: {
  branchId: string;
  previousDate: string;
  /** The debt rows exactly as this report held them before the correction. */
  previousDebtLines: Array<{ label: string; amountPaise: number }>;
  /**
   * Other reports on the same branch and date that still hold a debt row — the
   * only reports a ledger entry from that date could belong to. When there are
   * none, a leftover entry can only be this report's, which is how a day that
   * was already corrected into a mismatch gets repaired.
   */
  otherDebtReportsOnDate: number;
  nextDate: string;
  debtLines: Array<{ label: string; amountPaise: number }>;
  ledger: Debt[];
}): ReportDebtChange {
  const candidates = input.ledger.filter((debt) => {
    if (debt.source !== "report" || debt.voided) return false;
    if (debt.branchId !== input.branchId) return false;
    if (debt.debtDate !== input.previousDate) return false;

    // A ledger entry carries no pointer back to its report, and two reports may
    // share a date. So an entry only counts as this report's when no other debt
    // report shares the day, or when it looks like a row this report held
    // before the correction.
    if (input.otherDebtReportsOnDate === 0) return true;
    return input.previousDebtLines.some(
      (line) =>
        debt.amountPaise === line.amountPaise &&
        debtNameKey(debt.productName) === debtNameKey(line.label),
    );
  });

  const remaining = [...candidates];
  const openLines = [...input.debtLines];
  const pairs: Array<{ debt: Debt; line: { label: string; amountPaise: number } }> = [];

  // Matching stops here on purpose. A catch-all pass would pair whatever is
  // left over, so a day with two corrected rows could attach one entry's
  // payments to the other's product. Unpaired rows are created fresh instead:
  // the unpaired entry is voided, never deleted, so nothing is lost from the
  // audit trail.
  const passes: Array<(debt: Debt, line: { label: string; amountPaise: number }) => boolean> = [
    (debt, line) =>
      debt.amountPaise === line.amountPaise &&
      debtNameKey(debt.productName) === debtNameKey(line.label),
    (debt, line) => debt.amountPaise === line.amountPaise,
    (debt, line) => debtNameKey(debt.productName) === debtNameKey(line.label),
  ];

  for (const matches of passes) {
    for (let index = 0; index < openLines.length; index += 1) {
      const line = openLines[index];
      const found = remaining.findIndex((debt) => matches(debt, line));
      if (found < 0) continue;
      pairs.push({ debt: remaining[found], line });
      remaining.splice(found, 1);
      openLines.splice(index, 1);
      index -= 1;
    }
  }

  const updates: ReportDebtChange["updates"] = [];
  for (const { debt, line } of pairs) {
    const productName = line.label.trim() || debt.productName;
    const changed =
      debt.productName !== productName ||
      debt.amountPaise !== line.amountPaise ||
      debt.debtDate !== input.nextDate;
    if (!changed) continue;
    updates.push({
      id: debt.id,
      productName,
      amountPaise: line.amountPaise,
      debtDate: input.nextDate,
    });
  }

  return {
    updates,
    creates: openLines.map((line) => ({
      productName: line.label.trim() || "Credit sale item",
      amountPaise: line.amountPaise,
      debtDate: input.nextDate,
    })),
    voids: remaining.map((debt) => ({
      id: debt.id,
      productName: debt.productName,
      amountPaise: debt.amountPaise,
      paymentCount: debt.payments.length,
      paidPaise: debtPaidPaise(debt),
    })),
  };
}

/**
 * The Firestore document written when an admin adds a branch.
 *
 * `firestore.rules` validates a string whenever an optional key is present, so
 * the manager fields are *omitted* when they are blank instead of written as
 * null: `managerEmail: null` made every create from the admin portal fail, with
 * no branch and no explanation. The email is lower-cased because that is the
 * value both the rules and the manager lookup compare against.
 */
export function buildBranchDocument(input: {
  name: string;
  managerEmail?: string | null;
  managerName?: string | null;
  createdAt: string;
}): {
  id: string;
  data: {
    name: string;
    isActive: true;
    createdAt: string;
    managerEmail?: string;
    managerName?: string;
  };
} {
  const name = input.name.trim();
  const managerEmail = (input.managerEmail ?? "").trim().toLowerCase();
  const managerName = (input.managerName ?? "").trim();

  return {
    id: branchIdFromName(name),
    data: {
      name,
      isActive: true,
      createdAt: input.createdAt,
      ...(managerEmail ? { managerEmail } : {}),
      ...(managerName ? { managerName } : {}),
    },
  };
}

export const REVIEW_META: Array<{
  key: ReviewStatus;
  label: string;
  hint: string;
}> = [
  { key: "pending", label: "Needs review", hint: "No admin has checked this yet" },
  { key: "ok", label: "OK", hint: "Checked and accepted" },
  { key: "concern", label: "Concern", hint: "Flagged for follow-up" },
];

export function reviewLabel(status: ReviewStatus): string {
  return REVIEW_META.find((meta) => meta.key === status)?.label ?? "Needs review";
}

export function reviewCounts(
  reports: DailyReport[],
): Record<ReviewStatus, number> {
  const counts: Record<ReviewStatus, number> = { pending: 0, ok: 0, concern: 0 };
  for (const report of reports) counts[report.reviewStatus] += 1;
  return counts;
}

/**
 * Everything the UI needs about one report, computed once per data change.
 *
 * Totals are derived from the lines, so summing them inside a render pass would
 * repeat the same work for every table row, tile and trend point.
 */
export type ReportSummary = {
  report: DailyReport;
  totalPaise: number;
  sections: Record<SectionKey, number>;
  /** Money spent that day; tracked beside Total Sale, never inside it. */
  expensePaise: number;
  financeCount: number;
  hasDebt: boolean;
};

export function summarizeReports(reports: DailyReport[]): ReportSummary[] {
  return reports.map((report) => {
    // A closed day is a notice, not a sale: nothing on it may move a total, even
    // if an amount reached the document by hand or by an older client.
    const closed = isShopClosed(report);
    const sections = closed ? { ...ZERO_SECTIONS } : sectionTotals(report);
    return {
      report,
      totalPaise: closed ? 0 : computeTotalSale(sections),
      sections,
      expensePaise: closed ? 0 : reportExpensePaise(report),
      financeCount: closed ? 0 : reportFinanceCount(report),
      hasDebt: closed
        ? false
        : report.lines.some((line) => line.category === "debt"),
    };
  });
}

/**
 * Date → Total Sale, so a trend never re-scans the report list per day.
 *
 * Advances an admin has added to a sale are part of that day's Total Sale, but
 * they belong to the branch's day rather than to one report — so they are added
 * once per branch and date. Two reports filed on the same day therefore cannot
 * count the same advance twice. Only advances for branches present in
 * `summaries` are added, which keeps a branch-filtered list from picking up
 * another branch's advance.
 */
/**
 * `branchId|date` for every day a branch filed as closed.
 *
 * A closed day carries no sale, so an advance cannot be folded into it either:
 * otherwise a day that reads "shop closed" would still show money.
 */
export function closedBranchDates(summaries: ReportSummary[]): Set<string> {
  const closed = new Set<string>();
  for (const summary of summaries) {
    if (!isShopClosed(summary.report)) continue;
    closed.add(`${summary.report.branchId}|${summary.report.reportDate}`);
  }
  return closed;
}

export function totalsByDate(
  summaries: ReportSummary[],
  advances: Advance[] = [],
): Map<string, number> {
  const totals = new Map<string, number>();
  const branches = new Set<string>();
  const closed = closedBranchDates(summaries);

  for (const summary of summaries) {
    const date = summary.report.reportDate;
    branches.add(summary.report.branchId);
    totals.set(date, (totals.get(date) ?? 0) + summary.totalPaise);
  }

  for (const advance of advances) {
    if (!advance.appliedOn || !branches.has(advance.branchId)) continue;
    if (closed.has(`${advance.branchId}|${advance.appliedOn}`)) continue;
    const paise = advanceAppliedPaise(advance);
    if (paise <= 0) continue;
    totals.set(advance.appliedOn, (totals.get(advance.appliedOn) ?? 0) + paise);
  }

  return totals;
}

/** Branch → date → Total Sale, for per-branch trend lines. */
export function totalsByBranchDate(
  summaries: ReportSummary[],
  advances: Advance[] = [],
): Map<string, Map<string, number>> {
  const totals = new Map<string, Map<string, number>>();
  const closed = closedBranchDates(summaries);

  for (const summary of summaries) {
    const branchId = summary.report.branchId;
    const byDate = totals.get(branchId) ?? new Map<string, number>();
    const date = summary.report.reportDate;
    byDate.set(date, (byDate.get(date) ?? 0) + summary.totalPaise);
    totals.set(branchId, byDate);
  }

  // Same rule as `totalsByDate`: an advance lands once on its branch's day,
  // and never on a day that branch filed as closed.
  for (const advance of advances) {
    if (!advance.appliedOn) continue;
    if (closed.has(`${advance.branchId}|${advance.appliedOn}`)) continue;
    const paise = advanceAppliedPaise(advance);
    if (paise <= 0) continue;
    const byDate = totals.get(advance.branchId) ?? new Map<string, number>();
    byDate.set(
      advance.appliedOn,
      (byDate.get(advance.appliedOn) ?? 0) + paise,
    );
    totals.set(advance.branchId, byDate);
  }

  return totals;
}

/**
 * `days` trend points ending on `endDate`, read from a prebuilt date map.
 *
 * The date cursor is advanced in UTC rather than re-parsing a date string per
 * point, and weekday labels are memoised in `format.ts`, so a re-render does no
 * date parsing or Intl work beyond the first look at each day.
 */
export function trendSeries(
  totals: Map<string, number>,
  days: number,
  endDate: string,
): Array<{ label: string; value: number }> {
  const [year, month, day] = endDate.split("-").map(Number);
  const cursor = new Date(
    Date.UTC(year, month - 1, day) - (days - 1) * 86_400_000,
  );
  const points: Array<{ label: string; value: number }> = [];

  for (let index = 0; index < days; index += 1) {
    const date = cursor.toISOString().slice(0, 10);
    points.push({ label: formatWeekdayShort(date), value: totals.get(date) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return points;
}

/** Keeps only the reports inside an inclusive date range. */
export function withinRange(
  summaries: ReportSummary[],
  startDate: string,
  endDate: string,
): ReportSummary[] {
  return summaries.filter(
    (summary) =>
      summary.report.reportDate >= startDate && summary.report.reportDate <= endDate,
  );
}
