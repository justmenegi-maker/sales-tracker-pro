import { describe, it, expect } from "vitest";
import {
  advanceAppliedPaise,
  advanceApplyError,
  advanceHeldPaise,
  advanceRefundError,
  advanceRefundedPaise,
  advancesAppliedOn,
  branchIdFromName,
  buildBranchDocument,
  buildReportEditPayload,
  debtOutstandingPaise,
  debtPaidPaise,
  deriveAdvanceStatus,
  debtIsOverdue,
  deriveDebtStatus,
  reportFinanceCount,
  reportTotalPaise,
  reportsForDate,
  resolveFilingBranch,
  reviewCounts,
  sectionTotals,
  summarizeAdvances,
  summarizeOfflineSales,
  summarizeReports,
  totalsByBranchDate,
  totalsByDate,
  trendSeries,
  withinRange,
} from "./report";
import type { Advance, Branch, DailyReport, Debt, OfflineSale } from "./report";

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

function advance(overrides: Partial<Advance> = {}): Advance {
  return {
    id: "advance_1",
    branchId: "branch_kaza",
    customerName: "Imran",
    itemName: "Ceiling fan",
    amountPaise: 200000,
    advanceDate: "2026-10-13",
    appliedOn: null,
    appliedByName: null,
    refunds: [],
    note: null,
    createdAt: "2026-10-13T09:00:00.000Z",
    ...overrides,
  };
}

function offlineSale(overrides: Partial<OfflineSale> = {}): OfflineSale {
  return {
    id: "offline_1",
    branchId: "branch_kaza",
    itemName: "Ceiling fan",
    amountPaise: 320000,
    saleDate: "2026-10-13",
    addedToSystem: false,
    addedAt: null,
    addedByName: null,
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
    dueDate: null,
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

  it("flags a debt as overdue only after its due date has passed", () => {
    const due = debt({ dueDate: "2026-10-20" });

    expect(debtIsOverdue(due, "2026-10-21")).toBe(true);
    expect(debtIsOverdue(due, "2026-10-20")).toBe(false);
    expect(debtIsOverdue(due, "2026-10-19")).toBe(false);
    expect(debtIsOverdue(debt(), "2026-10-21")).toBe(false);
    expect(
      debtIsOverdue(debt({ dueDate: "2026-10-20", voided: true }), "2026-10-21"),
    ).toBe(false);
    expect(
      debtIsOverdue(
        debt({
          dueDate: "2026-10-20",
          payments: [
            {
              id: "p1",
              amountPaise: 640000,
              paidOn: "2026-10-19",
              note: null,
            },
          ],
        }),
        "2026-10-21",
      ),
    ).toBe(false);
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

describe("advance derivation", () => {
  it("holds the full advance until it is applied or refunded", () => {
    expect(deriveAdvanceStatus(advance())).toBe("open");
    expect(advanceHeldPaise(advance())).toBe(200000);
    expect(advanceRefundedPaise(advance())).toBe(0);
  });

  it("stops holding money once it is applied to a sale date", () => {
    const applied = advance({
      appliedOn: "2026-10-20",
      appliedByName: "Admin",
    });
    expect(deriveAdvanceStatus(applied)).toBe("applied");
    expect(advanceHeldPaise(applied)).toBe(0);
  });

  it("tracks partial and full refunds", () => {
    const partial = advance({
      refunds: [
        { id: "r1", amountPaise: 50000, refundedOn: "2026-10-14", note: null },
      ],
    });
    expect(deriveAdvanceStatus(partial)).toBe("open");
    expect(advanceHeldPaise(partial)).toBe(150000);

    const full = advance({
      refunds: [
        { id: "r1", amountPaise: 50000, refundedOn: "2026-10-14", note: null },
        { id: "r2", amountPaise: 150000, refundedOn: "2026-10-15", note: null },
      ],
    });
    expect(deriveAdvanceStatus(full)).toBe("refunded");
    expect(advanceHeldPaise(full)).toBe(0);
  });

  it("never holds a negative balance after an over-refund", () => {
    const over = advance({
      refunds: [
        { id: "r1", amountPaise: 250000, refundedOn: "2026-10-14", note: null },
      ],
    });
    expect(advanceHeldPaise(over)).toBe(0);
  });
});

describe("summarizeAdvances", () => {
  it("splits held, applied and refunded money without double counting", () => {
    const summary = summarizeAdvances([
      advance({ id: "a", amountPaise: 200000 }),
      advance({ id: "b", amountPaise: 300000, appliedOn: "2026-10-20" }),
      advance({
        id: "c",
        amountPaise: 100000,
        refunds: [
          { id: "r1", amountPaise: 40000, refundedOn: "2026-10-15", note: null },
        ],
      }),
      advance({
        id: "d",
        amountPaise: 50000,
        refunds: [
          { id: "r2", amountPaise: 50000, refundedOn: "2026-10-16", note: null },
        ],
      }),
    ]);

    expect(summary.heldPaise).toBe(260000);
    expect(summary.appliedPaise).toBe(300000);
    expect(summary.refundedPaise).toBe(90000);
    expect(summary.openCount).toBe(2);
    expect(summary.appliedCount).toBe(1);
    expect(summary.refundedCount).toBe(1);
  });

  it("counts only the unrefunded part when a refunded advance is applied", () => {
    const partiallyRefunded = advance({
      amountPaise: 100000,
      appliedOn: "2026-10-20",
      refunds: [
        { id: "r1", amountPaise: 40000, refundedOn: "2026-10-15", note: null },
      ],
    });

    expect(advanceAppliedPaise(partiallyRefunded)).toBe(60000);
    const summary = summarizeAdvances([partiallyRefunded]);
    expect(summary.appliedPaise).toBe(60000);
    expect(summary.refundedPaise).toBe(40000);
    expect(summary.heldPaise).toBe(0);
    expect(
      advancesAppliedOn([partiallyRefunded], "branch_kaza", "2026-10-20")
        .totalPaise,
    ).toBe(60000);
  });

  it("reports zeros for an empty ledger", () => {
    expect(summarizeAdvances([])).toEqual({
      heldPaise: 0,
      appliedPaise: 0,
      refundedPaise: 0,
      openCount: 0,
      appliedCount: 0,
      refundedCount: 0,
    });
  });
});

describe("advancesAppliedOn", () => {
  it("finds the advances folded into one day's sale for one branch", () => {
    const advances = [
      advance({ id: "a", appliedOn: "2026-10-20", amountPaise: 200000 }),
      advance({ id: "b", appliedOn: "2026-10-20", amountPaise: 150000 }),
      advance({ id: "c", appliedOn: "2026-10-21", amountPaise: 90000 }),
      advance({
        id: "d",
        branchId: "branch_spillow",
        appliedOn: "2026-10-20",
        amountPaise: 50000,
      }),
    ];

    expect(advancesAppliedOn(advances, "branch_kaza", "2026-10-20")).toEqual({
      count: 2,
      totalPaise: 350000,
    });
    expect(advancesAppliedOn(advances, "branch_kaza", "2026-10-19")).toEqual({
      count: 0,
      totalPaise: 0,
    });
  });
});

describe("advance actions", () => {
  it("lets a held advance be added to a sale date", () => {
    expect(advanceApplyError(advance(), "2026-10-20")).toBeNull();
    expect(advanceApplyError(advance(), "")).toBe(
      "Pick the sale date this advance belongs to.",
    );
    expect(
      advanceApplyError(advance({ appliedOn: "2026-10-20" }), "2026-10-20"),
    ).not.toBeNull();
  });

  it("allows a refund up to the money still held", () => {
    const partial = advance({
      refunds: [
        { id: "r1", amountPaise: 50000, refundedOn: "2026-10-14", note: null },
      ],
    });
    expect(advanceRefundError(partial, 150000)).toBeNull();
    expect(advanceRefundError(partial, 150001)).toBe(
      "The refund cannot be more than the advance still held.",
    );
    expect(advanceRefundError(partial, 0)).toBe(
      "Enter the amount being refunded.",
    );
  });

  it("refuses a refund on an advance already counted in a sale", () => {
    expect(
      advanceRefundError(advance({ appliedOn: "2026-10-20" }), 100000),
    ).toBe(
      "This advance is already counted in a sale, so it cannot be refunded here.",
    );
  });

  it("refuses a second refund once the money is fully returned", () => {
    const refunded = advance({
      refunds: [
        { id: "r1", amountPaise: 200000, refundedOn: "2026-10-14", note: null },
      ],
    });
    expect(advanceRefundError(refunded, 100)).toBe(
      "This advance has already been refunded in full.",
    );
  });
});

describe("buildReportEditPayload", () => {
  const editedAt = "2026-10-18T10:00:00.000Z";

  it("rebuilds the report with the corrected amounts and audit fields", () => {
    const { data, error } = buildReportEditPayload(
      {
        reportDate: "2026-10-13",
        cashPaise: 300000,
        onlinePaise: 0,
        lines: [
          { category: "finance", label: "Bajaj Finance", amountPaise: 125000 },
          { category: "others", label: "Delivery", amountPaise: 0 },
        ],
        note: "  counted cash twice  ",
      },
      "Admin",
      editedAt,
    );

    expect(error).toBeNull();
    expect(data.cashPaise).toBe(300000);
    expect(data.note).toBe("counted cash twice");
    expect(data.editedByName).toBe("Admin");
    expect(data.editedAt).toBe(editedAt);
    // Zeroed rows are dropped instead of being stored as empty lines.
    expect((data.lines as unknown[]).length).toBe(1);
  });

  it("stores a blank note as null", () => {
    const { data } = buildReportEditPayload(
      {
        reportDate: "2026-10-13",
        cashPaise: 0,
        onlinePaise: 0,
        lines: [],
        note: "   ",
      },
      "Admin",
      editedAt,
    );
    expect(data.note).toBeNull();
  });

  it("refuses negative or fractional amounts and a missing date", () => {
    const base = {
      reportDate: "2026-10-13",
      cashPaise: 0,
      onlinePaise: 0,
      lines: [],
      note: null,
    };

    expect(
      buildReportEditPayload({ ...base, cashPaise: -1 }, "Admin", editedAt)
        .error,
    ).not.toBeNull();
    expect(
      buildReportEditPayload(
        {
          ...base,
          lines: [{ category: "others", label: "x", amountPaise: 10.5 }],
        },
        "Admin",
        editedAt,
      ).error,
    ).not.toBeNull();
    expect(
      buildReportEditPayload({ ...base, reportDate: "" }, "Admin", editedAt)
        .error,
    ).toBe("Pick the report date.");
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

describe("summarizeOfflineSales", () => {
  it("counts pending and added reminders separately", () => {
    const summary = summarizeOfflineSales([
      offlineSale({ id: "a", amountPaise: 320000 }),
      offlineSale({ id: "b", amountPaise: 150000, addedToSystem: true }),
      offlineSale({ id: "c", amountPaise: 80000, addedToSystem: true }),
    ]);

    expect(summary).toEqual({
      pending: 1,
      added: 2,
      pendingPaise: 320000,
      addedPaise: 230000,
    });
  });

  it("returns zeros for an empty reminder list", () => {
    expect(summarizeOfflineSales([])).toEqual({
      pending: 0,
      added: 0,
      pendingPaise: 0,
      addedPaise: 0,
    });
  });

  it("never changes a report's Total Sale", () => {
    // Offline-sale prices are reference data: the cash or online amount has
    // already been counted, so including the price again would double it.
    const day = report();
    const before = reportTotalPaise(day);
    const summary = summarizeOfflineSales([
      offlineSale({ amountPaise: 999900 }),
    ]);

    expect(summary.pendingPaise).toBe(999900);
    expect(reportTotalPaise(day)).toBe(before);
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
