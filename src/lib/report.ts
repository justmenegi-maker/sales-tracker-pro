/**
 * Domain model for the SK Tapri daily sales report.
 *
 * This mirrors the Supabase schema in `supabase/migrations`:
 *  - `daily_reports` keeps cash + online as columns and the rest as lines
 *  - `report_lines` holds finance / debt / exchange / cheque / store_use / others
 *  - `debts` + `debt_payments` drive the debt ledger
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
  voidReason: string | null;
  createdAt: string;
  reviewStatus: ReviewStatus;
  reviewNote: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export type DebtPayment = {
  id: string;
  amountPaise: number;
  paidOn: string;
  note: string | null;
};

export type DebtStatus = "open" | "partial" | "cleared";

export type Debt = {
  id: string;
  branchId: string;
  productName: string;
  amountPaise: number;
  debtDate: string;
  source: "report" | "manual";
  voided: boolean;
  payments: DebtPayment[];
};

export type SaveReportInput = {
  branchId: string;
  reportDate: string;
  cashPaise: number;
  onlinePaise: number;
  lines: Array<Pick<ReportLine, "category" | "label" | "amountPaise">>;
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
    totals[line.category] += line.amountPaise;
  }

  return totals;
}

/** Total Sale for a report, computed through the shared totals module. */
export function reportTotalPaise(report: DailyReport): number {
  return computeTotalSale(sectionTotals(report));
}

export function reportFinanceCount(report: DailyReport): number {
  return report.lines.filter((line) => line.category === "finance").length;
}

export function debtPaidPaise(debt: Debt): number {
  return debt.payments.reduce((sum, payment) => sum + payment.amountPaise, 0);
}

export function debtOutstandingPaise(debt: Debt): number {
  return Math.max(0, debt.amountPaise - debtPaidPaise(debt));
}

/** Mirrors the `sync_debt_status_from_payments` trigger in migration 003. */
export function deriveDebtStatus(debt: Debt): DebtStatus {
  const paid = debtPaidPaise(debt);
  if (paid >= debt.amountPaise) return "cleared";
  if (paid > 0) return "partial";
  return "open";
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
  financeCount: number;
  hasDebt: boolean;
};

export function summarizeReports(reports: DailyReport[]): ReportSummary[] {
  return reports.map((report) => {
    const sections = sectionTotals(report);
    return {
      report,
      totalPaise: computeTotalSale(sections),
      sections,
      financeCount: report.lines.filter((line) => line.category === "finance").length,
      hasDebt: report.lines.some((line) => line.category === "debt"),
    };
  });
}

/** Date → Total Sale, so a trend never re-scans the report list per day. */
export function totalsByDate(
  summaries: ReportSummary[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const summary of summaries) {
    const date = summary.report.reportDate;
    totals.set(date, (totals.get(date) ?? 0) + summary.totalPaise);
  }
  return totals;
}

/** Branch → date → Total Sale, for per-branch trend lines. */
export function totalsByBranchDate(
  summaries: ReportSummary[],
): Map<string, Map<string, number>> {
  const totals = new Map<string, Map<string, number>>();
  for (const summary of summaries) {
    const branchId = summary.report.branchId;
    const byDate = totals.get(branchId) ?? new Map<string, number>();
    const date = summary.report.reportDate;
    byDate.set(date, (byDate.get(date) ?? 0) + summary.totalPaise);
    totals.set(branchId, byDate);
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
