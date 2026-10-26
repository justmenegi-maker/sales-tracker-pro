import { describe, expect, it } from "vitest";
import { summarizeReports } from "./report";
import type { DailyReport } from "./report";
import {
  buildRangeSales,
  endOfMonth,
  reportContext,
  shiftMonth,
  startOfMonth,
} from "./sales-analytics";

function report(overrides: Partial<DailyReport> = {}): DailyReport {
  return {
    id: "report_1",
    branchId: "branch_kaza",
    branchName: "SK Kaza",
    reportDate: "2026-10-13",
    submittedBy: "user_1",
    submittedByName: "Kaza staff",
    cashPaise: 10_000,
    onlinePaise: 0,
    lines: [],
    status: "active",
    voidReason: null,
    createdAt: "2026-10-13T14:20:00.000Z",
    note: null,
    reviewStatus: "pending",
    reviewNote: null,
    reviewedByName: null,
    reviewedAt: null,
    editedByName: null,
    editedAt: null,
    ...overrides,
  };
}

function summary(overrides: Partial<DailyReport> = {}) {
  return summarizeReports([report(overrides)])[0];
}

describe("month helpers", () => {
  it("walks across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-10", -5)).toBe("2026-05");
  });

  it("knows the edges of a month including February", () => {
    expect(startOfMonth("2026-10-17")).toBe("2026-10-01");
    expect(endOfMonth("2026-10-17")).toBe("2026-10-31");
    expect(endOfMonth("2024-02-10")).toBe("2024-02-29");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });
});

describe("buildRangeSales", () => {
  const summaries = [
    summary({ id: "a", reportDate: "2026-10-01", cashPaise: 10_000 }),
    summary({ id: "b", reportDate: "2026-10-03", cashPaise: 40_000 }),
    summary({ id: "c", reportDate: "2026-10-05", cashPaise: 5_000, lines: [
      { id: "l1", category: "finance", label: "Bajaj", amountPaise: 15_000 },
    ] }),
    summary({ id: "d", reportDate: "2026-10-10", cashPaise: 99_000 }),
    summary({ id: "void", reportDate: "2026-10-04", cashPaise: 70_000, status: "voided" }),
    summary({
      id: "other",
      reportDate: "2026-10-04",
      branchId: "branch_other",
      branchName: "SK Other",
      cashPaise: 0,
      onlinePaise: 25_000,
    }),
  ];

  it("zero-fills every day and excludes voided reports from totals", () => {
    const range = buildRangeSales(summaries, "2026-10-01", "2026-10-05");

    expect(range.days.map((day) => day.date)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
    expect(range.reportCount).toBe(4);
    expect(range.voidedCount).toBe(1);
    expect(range.totalPaise).toBe(10_000 + 40_000 + 25_000 + 5_000 + 15_000);
    expect(range.totalPaise).toBe(95_000);
    expect(range.filedDays.map((day) => day.date)).toEqual([
      "2026-10-01",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
    ]);
    expect(range.days.find((day) => day.date === "2026-10-02")?.reports).toBe(0);
  });

  it("takes best and lowest from filed days only", () => {
    const range = buildRangeSales(summaries, "2026-10-01", "2026-10-05");

    // 2026-10-01 is the lowest filed day; empty 2026-10-02 must not win.
    expect(range.lowestDay?.date).toBe("2026-10-01");
    expect(range.lowestDay?.totalPaise).toBe(10_000);
    expect(range.bestDay?.date).toBe("2026-10-03");
    expect(range.bestDay?.totalPaise).toBe(40_000);
    expect(range.averagePerFiledDayPaise).toBe(23_750);
  });

  it("breaks totals down by branch and section, largest branch first", () => {
    const range = buildRangeSales(summaries, "2026-10-01", "2026-10-05");

    expect(range.branchSlices.map((slice) => slice.branchName)).toEqual([
      "SK Kaza",
      "SK Other",
    ]);
    expect(range.sectionTotals.cash).toBe(55_000);
    expect(range.sectionTotals.online).toBe(25_000);
    expect(range.sectionTotals.finance).toBe(15_000);
  });

  it("sums expenses beside Total Sale without adding them to it", () => {
    const withExpenses = [
      summary({
        id: "x",
        reportDate: "2026-10-20",
        cashPaise: 30_000,
        lines: [
          { id: "e1", category: "expense", label: "Electricity", amountPaise: 4_500 },
          { id: "e2", category: "expense", label: "Tea", amountPaise: 500 },
        ],
      }),
      summary({
        id: "y",
        reportDate: "2026-10-21",
        cashPaise: 7_000,
        lines: [
          { id: "e3", category: "expense", label: "Repairs", amountPaise: 2_000 },
        ],
      }),
      summary({
        id: "void-expense",
        reportDate: "2026-10-22",
        cashPaise: 1_000,
        status: "voided",
        lines: [
          { id: "e4", category: "expense", label: "Voided", amountPaise: 9_000 },
        ],
      }),
    ];

    const range = buildRangeSales(withExpenses, "2026-10-20", "2026-10-22");

    expect(range.totalPaise).toBe(37_000);
    expect(range.expensePaise).toBe(7_000);
    expect(range.reportCount).toBe(2);
    expect(range.sectionTotals).not.toHaveProperty("expense");
  });

  it("builds a six-month trend ending in the range month", () => {
    const range = buildRangeSales(summaries, "2026-10-01", "2026-10-05");

    expect(range.monthlyTrend).toHaveLength(6);
    expect(range.monthlyTrend.map((month) => month.key)).toEqual([
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    // The trend reads the whole loaded list, not just the selected range.
    const october = range.monthlyTrend[5];
    expect(october.totalPaise).toBe(95_000 + 99_000);
    expect(october.reports).toBe(5);
  });

  it("handles an empty range without inventing a best day", () => {
    const range = buildRangeSales(summaries, "2026-11-01", "2026-11-03");

    expect(range.totalPaise).toBe(0);
    expect(range.bestDay).toBeNull();
    expect(range.lowestDay).toBeNull();
    expect(range.filedDays).toHaveLength(0);
    expect(range.averagePerFiledDayPaise).toBe(0);
  });
});

describe("reportContext", () => {
  const summaries = [
    summary({ id: "a", reportDate: "2026-10-06", cashPaise: 10_000 }),
    summary({ id: "b", reportDate: "2026-10-07", cashPaise: 20_000 }),
    summary({ id: "c", reportDate: "2026-10-09", cashPaise: 30_000 }),
    summary({ id: "current", reportDate: "2026-10-10", cashPaise: 30_000 }),
    summary({
      id: "old",
      reportDate: "2026-09-20",
      cashPaise: 99_000,
    }),
    summary({
      id: "other-branch",
      branchId: "branch_other",
      branchName: "SK Other",
      reportDate: "2026-10-08",
      cashPaise: 80_000,
    }),
  ];

  const current = {
    ...summary({ id: "current", reportDate: "2026-10-10", cashPaise: 30_000 }),
  };

  it("averages the same branch's filed days in the previous week", () => {
    const context = reportContext(summaries, current);

    // 6, 7 and 9 Oct → (10k + 20k + 30k) / 3 = 20k.
    expect(context.sampleDays).toBe(3);
    expect(context.typicalPaise).toBe(20_000);
    expect(context.changeVsTypical).toBe(50);
  });

  it("reads the previous calendar day only when it was filed", () => {
    const context = reportContext(summaries, current);
    expect(context.previousDay?.date).toBe("2026-10-09");
    expect(context.previousDay?.totalPaise).toBe(30_000);

    const noPrevious = reportContext(summaries, {
      ...current,
      report: { ...current.report, reportDate: "2026-10-06" },
    });
    expect(noPrevious.previousDay).toBeNull();
  });

  it("ignores other branches and reports after the current date", () => {
    const context = reportContext(summaries, current);
    expect(context.bestInRange?.totalPaise).toBe(30_000);
    expect(context.lowestInRange?.totalPaise).toBe(10_000);
  });
});
