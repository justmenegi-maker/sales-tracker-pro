import { assertNonNegativePaise, isNonNegativePaise, paiseSum } from "./money";

export type ReportSection =
  | "cash"
  | "online"
  | "finance"
  | "debt"
  | "exchange"
  | "cheque"
  | "store_use"
  | "others";

/**
 * Total Sale formula used by the app.
 *
 * Total Sale = Cash + Online + Finance + Debt + Exchange + Cheque + Store use + Others.
 *
 * This is authoritative server logic too — the client can compute a running
 * preview, but the server must recompute and reject mismatches.
 */
export function computeTotalSale(sections: {
  cash: number;
  online: number;
  finance: number;
  debt: number;
  exchange: number;
  cheque: number;
  store_use: number;
  others: number;
}): number {
  return paiseSum([
    assertNonNegativePaise(sections.cash, "cash"),
    assertNonNegativePaise(sections.online, "online"),
    assertNonNegativePaise(sections.finance, "finance"),
    assertNonNegativePaise(sections.debt, "debt"),
    assertNonNegativePaise(sections.exchange, "exchange"),
    assertNonNegativePaise(sections.cheque, "cheque"),
    assertNonNegativePaise(sections.store_use, "store_use"),
    assertNonNegativePaise(sections.others, "others"),
  ]);
}

/**
 * Quick check that the client-sent total matches the recomputed total.
 * Returns the corrected total; throws if any section is invalid.
 */
export function validateAndRecomputeTotalSale(sections: {
  cash: number;
  online: number;
  finance: number;
  debt: number;
  exchange: number;
  cheque: number;
  store_use: number;
  others: number;
  clientTotal: number;
}): number {
  const total = computeTotalSale(sections);
  if (total !== sections.clientTotal) {
    throw new Error(
      `Total mismatch: client sent ${sections.clientTotal} paise but computed total is ${total} paise`,
    );
  }
  return total;
}

export function isReportSectionLabel(label: string): boolean {
  return label.trim().length > 0;
}

export function isFinanceRowValid(label: string, amount: number): boolean {
  if (!isReportSectionLabel(label)) return false;
  if (!isNonNegativePaise(amount)) return false;
  return true;
}

export function isDebtRowValid(product: string, amount: number): boolean {
  if (!isReportSectionLabel(product)) return false;
  if (!isNonNegativePaise(amount)) return false;
  return true;
}

export function isOtherRowValid(description: string, amount: number): boolean {
  if (!isReportSectionLabel(description)) return false;
  if (!isNonNegativePaise(amount)) return false;
  return true;
}
