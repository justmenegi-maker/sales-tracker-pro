import { describe, it, expect } from "vitest";
import {
  debtOutstandingPaise,
  debtPaidPaise,
  deriveDebtStatus,
  reportFinanceCount,
  reportHasDebt,
  reportTotalPaise,
  reportsForDate,
  sectionTotals,
} from "./report";
import type { DailyReport, Debt } from "./report";

function report(overrides: Partial<DailyReport> = {}): DailyReport {
  return {
    id: "report_1",
    branchId: "branch_kaza",
    branchName: "SK Kaza",
    reportDate: "2026-10-13",
    submittedBy: "user_1",
    submittedByName: "SK Kaza",
    cashPaise: 2845000,
    onlinePaise: 1692000,
    lines: [
      { id: "l1", category: "finance", label: "Bajaj Finance", amountPaise: 1250000 },
      { id: "l2", category: "finance", label: "HDB", amountPaise: 300000 },
      { id: "l3", category: "debt", label: "Ceiling fan", amountPaise: 640000 },
      { id: "l4", category: "exchange", label: "Old fan", amountPaise: 180000 },
      { id: "l5", category: "store_use", label: "Owner use", amountPaise: 95000 },
      { id: "l6", category: "others", label: "Delivery", amountPaise: 210000 },
    ],
    status: "active",
    voidReason: null,
    createdAt: "2026-10-13T14:20:00.000Z",
    ...overrides,
  };
}

function debt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt_1",
    branchId: "branch_kaza",
    productName: "Ceiling fan",
    amountPaise: 640000,
    debtDate: "2026-10-13",
    source: "report",
    voided: false,
    payments: [],
    ...overrides,
  };
}

describe("sectionTotals", () => {
  it("splits the report into the eight sections", () => {
    const totals = sectionTotals(report());
    expect(totals).toEqual({
      cash: 2845000,
      online: 1692000,
      finance: 1550000,
      debt: 640000,
      exchange: 180000,
      cheque: 0,
      store_use: 95000,
      others: 210000,
    });
  });

  it("sums the sections into the Total Sale", () => {
    // 28,450 + 16,920 + 15,500 + 6,400 + 1,800 + 0 + 950 + 2,100 rupees
    expect(reportTotalPaise(report())).toBe(7212000);
  });

  it("returns zero for a report with no amounts", () => {
    const empty = report({ cashPaise: 0, onlinePaise: 0, lines: [] });
    expect(reportTotalPaise(empty)).toBe(0);
  });
});

describe("report flags", () => {
  it("counts finance rows and detects debt", () => {
    expect(reportFinanceCount(report())).toBe(2);
    expect(reportHasDebt(report())).toBe(true);
    expect(reportHasDebt(report({ lines: [] }))).toBe(false);
  });
});

describe("reportsForDate", () => {
  it("keeps only active reports for that branch and date", () => {
    const active = report({ id: "a" });
    const voided = report({ id: "b", status: "voided" });
    const otherDay = report({ id: "c", reportDate: "2026-10-12" });
    const otherBranch = report({ id: "d", branchId: "branch_spillow" });

    const result = reportsForDate(
      [active, voided, otherDay, otherBranch],
      "branch_kaza",
      "2026-10-13",
    );

    expect(result.map((item) => item.id)).toEqual(["a"]);
  });
});

describe("debt derivation", () => {
  it("is open without payments", () => {
    expect(deriveDebtStatus(debt())).toBe("open");
    expect(debtPaidPaise(debt())).toBe(0);
    expect(debtOutstandingPaise(debt())).toBe(640000);
  });

  it("is partial after a part payment", () => {
    const part = debt({
      payments: [
        { id: "p1", amountPaise: 250000, paidOn: "2026-10-15", note: null },
      ],
    });
    expect(deriveDebtStatus(part)).toBe("partial");
    expect(debtOutstandingPaise(part)).toBe(390000);
  });

  it("is cleared once payments cover the amount", () => {
    const cleared = debt({
      payments: [
        { id: "p1", amountPaise: 400000, paidOn: "2026-10-15", note: null },
        { id: "p2", amountPaise: 240000, paidOn: "2026-10-16", note: null },
      ],
    });
    expect(deriveDebtStatus(cleared)).toBe("cleared");
    expect(debtOutstandingPaise(cleared)).toBe(0);
  });

  it("never reports a negative outstanding balance", () => {
    const overpaid = debt({
      payments: [
        { id: "p1", amountPaise: 700000, paidOn: "2026-10-15", note: null },
      ],
    });
    expect(debtOutstandingPaise(overpaid)).toBe(0);
    expect(deriveDebtStatus(overpaid)).toBe("cleared");
  });
});
