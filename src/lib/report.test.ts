import { describe, it, expect } from "vitest";
import {
  branchIdFromName,
  buildBranchDocument,
  debtOutstandingPaise,
  debtPaidPaise,
  deriveDebtStatus,
  reportFinanceCount,
  reportTotalPaise,
  reportsForDate,
  resolveFilingBranch,
  reviewCounts,
  sectionTotals,
  summarizeReports,
  totalsByBranchDate,
  totalsByDate,
  trendSeries,
  withinRange,
} from "./report";
import type { Branch, DailyReport, Debt } from "./report";

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
    reviewStatus: "pending",
    reviewNote: null,
    reviewedByName: null,
    reviewedAt: null,
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

describe("reportFinanceCount", () => {
  it("counts the finance rows on a report", () => {
    expect(reportFinanceCount(report())).toBe(2);
    expect(reportFinanceCount(report({ lines: [] }))).toBe(0);
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

describe("summarizeReports", () => {
  it("precomputes the total, sections and flags once per report", () => {
    const [summary] = summarizeReports([report()]);

    expect(summary.totalPaise).toBe(7212000);
    expect(summary.sections.finance).toBe(1550000);
    expect(summary.financeCount).toBe(2);
    expect(summary.hasDebt).toBe(true);
    expect(summary.totalPaise).toBe(reportTotalPaise(summary.report));
  });

  it("totals by date, by branch and across a range", () => {
    const summaries = summarizeReports([
      report({ id: "a", reportDate: "2026-10-13" }),
      report({ id: "b", reportDate: "2026-10-13", cashPaise: 0, onlinePaise: 0, lines: [] }),
      report({
        id: "c",
        reportDate: "2026-10-11",
        branchId: "branch_spillow",
        cashPaise: 100000,
        onlinePaise: 0,
        lines: [],
      }),
    ]);

    const byDate = totalsByDate(summaries);
    expect(byDate.get("2026-10-13")).toBe(7212000);
    expect(byDate.get("2026-10-11")).toBe(100000);
    expect(byDate.get("2026-10-12")).toBeUndefined();

    const byBranch = totalsByBranchDate(summaries);
    expect(byBranch.get("branch_kaza")?.get("2026-10-13")).toBe(7212000);
    expect(byBranch.get("branch_spillow")?.get("2026-10-11")).toBe(100000);

    expect(withinRange(summaries, "2026-10-12", "2026-10-13")).toHaveLength(2);
    expect(withinRange(summaries, "2026-01-01", "2026-01-02")).toHaveLength(0);
  });

  it("builds trend points from the date map, filling empty days with zero", () => {
    const summaries = summarizeReports([report({ reportDate: "2026-10-13" })]);
    const points = trendSeries(totalsByDate(summaries), 3, "2026-10-13");

    expect(points).toHaveLength(3);
    expect(points[2].value).toBe(7212000);
    expect(points[0].value).toBe(0);
    expect(points.map((point) => point.label)).toEqual(["Sun", "Mon", "Tue"]);
  });
});

describe("reviewCounts", () => {
  it("tallies pending, ok and flagged reports", () => {
    const counts = reviewCounts([
      report({ id: "a" }),
      report({ id: "b", reviewStatus: "ok" }),
      report({ id: "c", reviewStatus: "concern", reviewNote: "cash low" }),
      report({ id: "d", reviewStatus: "concern", reviewNote: "duplicate row" }),
    ]);

    expect(counts).toEqual({ pending: 1, ok: 1, concern: 2 });
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

describe("buildBranchDocument", () => {
  const createdAt = "2026-10-16T06:00:00.000Z";

  it("omits the optional manager keys when they are blank", () => {
    // The reported bug: the form sent `managerEmail: null` / `managerName: null`,
    // the rules require a string whenever the key is present, and the create was
    // refused — "could not create branch" with no branch and no reason.
    const doc = buildBranchDocument({ name: "SK Tapri South Ex", createdAt });
    expect(Object.keys(doc.data).sort()).toEqual([
      "createdAt",
      "isActive",
      "name",
    ]);
  });

  it("never writes a null value for a manager field", () => {
    const doc = buildBranchDocument({
      name: "SK Tapri South Ex",
      managerEmail: "   ",
      managerName: null,
      createdAt,
    });
    expect(Object.values(doc.data)).not.toContain(null);
  });

  it("keeps the manager contact the rules compare against", () => {
    const doc = buildBranchDocument({
      name: "SK Tapri South Ex",
      managerEmail: "  Manager.SouthEx@Gmail.com ",
      managerName: "  Rahul Sharma  ",
      createdAt,
    });
    expect(doc.data.managerEmail).toBe("manager.southex@gmail.com");
    expect(doc.data.managerName).toBe("Rahul Sharma");
    expect(doc.data.name).toBe("SK Tapri South Ex");
    expect(doc.data.isActive).toBe(true);
  });

  it("takes a manager name without an email", () => {
    const doc = buildBranchDocument({
      name: "SK Tapri South Ex",
      managerName: "Rahul Sharma",
      createdAt,
    });
    expect(doc.data.managerName).toBe("Rahul Sharma");
    expect("managerEmail" in doc.data).toBe(false);
  });
});

describe("branchIdFromName", () => {
  it("slugifies a branch name into a document id", () => {
    expect(branchIdFromName("SK Tapri South Ex")).toBe("sk-tapri-south-ex");
    expect(branchIdFromName("  Kaza / Highway  ")).toBe("kaza-highway");
  });

  it("falls back to a generated id when nothing usable is left", () => {
    expect(branchIdFromName("!!!")).toMatch(/^branch_[a-z0-9]+_[a-z0-9]+$/);
  });

  it("produces an id the security rules accept", () => {
    // firestore.rules -> isValidId(): 1-128 chars of [a-zA-Z0-9_-]
    for (const name of ["SK Tapri South Ex", "Kaza / Highway", "!!!"]) {
      expect(branchIdFromName(name)).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    }
  });
});

describe("resolveFilingBranch", () => {
  const kaza: Branch = { id: "branch_kaza", name: "SK Kaza", isActive: true };

  it("uses the loaded branch document when it has arrived", () => {
    expect(
      resolveFilingBranch({
        branchId: "branch_kaza",
        branches: [kaza],
        session: { role: "admin", branchId: null },
      }),
    ).toBe(kaza);
  });

  it("still resolves a branch login's own branch before that document loads", () => {
    // The reported bug: the branch listener had been denied, so `branches` was
    // empty and filing was refused with "Pick a branch before submitting".
    expect(
      resolveFilingBranch({
        branchId: "branch_kaza",
        branches: [],
        session: { role: "branch", branchId: "branch_kaza", branchName: "SK Kaza" },
      }),
    ).toEqual({ id: "branch_kaza", name: "SK Kaza", isActive: true });
  });

  it("falls back to the branch id when the session carries no branch name", () => {
    expect(
      resolveFilingBranch({
        branchId: "branch_kaza",
        branches: [],
        session: { role: "branch", branchId: "branch_kaza", branchName: null },
      })?.name,
    ).toBe("branch_kaza");
  });

  it("refuses a branch login filing for another branch", () => {
    expect(
      resolveFilingBranch({
        branchId: "branch_spillow",
        branches: [],
        session: { role: "branch", branchId: "branch_kaza", branchName: "SK Kaza" },
      }),
    ).toBeNull();
  });

  it("refuses an admin filing for a branch that is not loaded", () => {
    expect(
      resolveFilingBranch({
        branchId: "branch_ghost",
        branches: [kaza],
        session: { role: "admin", branchId: null },
      }),
    ).toBeNull();
  });

  it("refuses when no branch has been chosen", () => {
    expect(
      resolveFilingBranch({ branchId: "", branches: [kaza], session: null }),
    ).toBeNull();
  });
});
