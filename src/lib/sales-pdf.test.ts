import { describe, expect, it } from "vitest";
import { summarizeReports } from "./report";
import type { DailyReport } from "./report";
import { buildRangeSales } from "./sales-analytics";
import { buildSalesPdf, salesPdfFilename } from "./sales-pdf";

function report(overrides: Partial<DailyReport> = {}): DailyReport {
  return {
    id: "report_1",
    branchId: "branch_kaza",
    branchName: "SK Kaza",
    reportDate: "2026-10-01",
    submittedBy: "user_1",
    submittedByName: "Kaza staff",
    cashPaise: 25_000,
    onlinePaise: 10_000,
    lines: [
      { id: "l1", category: "finance", label: "Bajaj", amountPaise: 12_000 },
    ],
    status: "active",
    voidReason: null,
    createdAt: "2026-10-01T14:20:00.000Z",
    reviewStatus: "pending",
    reviewNote: null,
    reviewedByName: null,
    reviewedAt: null,
    ...overrides,
  };
}

const reports: DailyReport[] = [
  report({ id: "a", reportDate: "2026-10-01" }),
  report({
    id: "b",
    reportDate: "2026-10-02",
    cashPaise: 90_000,
    reviewStatus: "ok",
    reviewedByName: "Admin",
    reviewedAt: "2026-10-03T10:00:00.000Z",
  }),
  report({
    id: "c",
    reportDate: "2026-10-03",
    branchId: "branch_south",
    branchName: "SK South",
    cashPaise: 4_000,
    onlinePaise: 0,
    lines: [],
    reviewStatus: "concern",
    reviewNote: "Cash is far below the usual total.",
  }),
  report({
    id: "void",
    reportDate: "2026-10-04",
    cashPaise: 500_000,
    status: "voided",
  }),
];

const summaries = summarizeReports(reports);

describe("sales PDF", () => {
  it("builds a valid PDF with the summary and a review appendix", async () => {
    const range = buildRangeSales(summaries, "2026-10-01", "2026-10-31");
    const { doc, filename } = await buildSalesPdf({
      range,
      scopeLabel: "All branches",
      generatedAt: new Date("2026-10-17T10:00:00.000Z"),
    });

    const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
    const header = new TextDecoder().decode(bytes.slice(0, 5));

    expect(header).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(4000);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(filename).toBe("sk-tapri-sales-2026-10-01-to-2026-10-31-all-branches.pdf");
  });

  it("does not throw for a range with no reports", async () => {
    const range = buildRangeSales(summaries, "2026-12-01", "2026-12-07");
    const { doc } = await buildSalesPdf({
      range,
      scopeLabel: "SK South",
    });

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
  });

  it("slugs the filename from the scope", () => {
    const range = buildRangeSales(summaries, "2026-10-01", "2026-10-07");
    expect(salesPdfFilename(range, "SK Tapri South Ex")).toBe(
      "sk-tapri-sales-2026-10-01-to-2026-10-07-sk-tapri-south-ex.pdf",
    );
  });
});
