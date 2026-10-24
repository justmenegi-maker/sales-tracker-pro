import { assertNonNegativePaise, paiseSum } from "./money";

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
 * Expenses are deliberately absent: they are money paid out, recorded on the
 * report beside Total Sale so the day's net in hand can be read off it.
 *
 * This is the single place the arithmetic lives: the form previews with it and
 * the submit path recomputes with it, so the stored total is never trusted from
 * the client.
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
