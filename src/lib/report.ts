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

export function reportHasDebt(report: DailyReport): boolean {
  return report.lines.some((line) => line.category === "debt");
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

export function findBranch(
  branches: Branch[],
  branchId: string | null | undefined,
): Branch | undefined {
  if (!branchId) return undefined;
  return branches.find((branch) => branch.id === branchId);
}

/** Active (non-voided) reports for one branch, newest first. */
export function branchReports(
  reports: DailyReport[],
  branchId: string,
): DailyReport[] {
  return reports
    .filter((report) => report.branchId === branchId && report.status === "active")
    .sort((a, b) => (a.reportDate < b.reportDate ? 1 : -1));
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
