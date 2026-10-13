import { describe, it, expect } from "vitest";
import { buildDemoDebts, buildDemoReports, createDemoWorkspace, DEMO_BRANCHES } from "./demo-data";
import { deriveDebtStatus, reportTotalPaise } from "./report";
import { addDays, todayISO } from "./format";

function fingerprint(reports: ReturnType<typeof buildDemoReports>) {
  return reports.map((report) => [
    report.branchId,
    report.reportDate,
    report.cashPaise,
    report.onlinePaise,
    report.lines.map((line) => `${line.category}:${line.amountPaise}`),
  ]);
}

describe("demo workspace", () => {
  it("files reports for both branches across the last three weeks", () => {
    const reports = buildDemoReports();
    const today = todayISO();
    const firstDay = addDays(today, -20);

    expect(new Set(reports.map((report) => report.branchId))).toEqual(
      new Set(DEMO_BRANCHES.map((branch) => branch.id)),
    );
    expect(reports.length).toBeGreaterThan(20);

    for (const report of reports) {
      expect(report.reportDate >= firstDay && report.reportDate <= today).toBe(true);
      expect(reportTotalPaise(report)).toBeGreaterThan(0);
      expect(report.status).toBe("active");
    }
  });

  it("stays deterministic between calls", () => {
    expect(fingerprint(buildDemoReports())).toEqual(
      fingerprint(buildDemoReports()),
    );
  });

  it("gives the ledger one entry per debt row on a report", () => {
    const reports = buildDemoReports();
    const debtLines = reports.flatMap((report) =>
      report.lines.filter((line) => line.category === "debt"),
    );
    const debts = buildDemoDebts(reports);

    expect(debts.length).toBe(debtLines.length);
    for (const debt of debts) {
      expect(debt.amountPaise).toBeGreaterThan(0);
      expect(debt.source).toBe("report");
      expect(["open", "partial", "cleared"]).toContain(deriveDebtStatus(debt));
    }
    // The demo history should contain all three ledger states.
    const statuses = new Set(debts.map(deriveDebtStatus));
    expect(statuses.has("open")).toBe(true);
    expect(statuses.has("cleared")).toBe(true);
  });

  it("returns a complete workspace", () => {
    const workspace = createDemoWorkspace();
    expect(workspace.branches.length).toBe(2);
    expect(workspace.reports.length).toBeGreaterThan(0);
    expect(workspace.debts.length).toBeGreaterThan(0);
  });
});
