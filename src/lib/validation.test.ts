import { describe, it, expect } from "vitest";
import {
  MAX_AMOUNT_PAISE,
  MAX_LABEL_LENGTH,
  isIsoDate,
  isValidEmail,
  safeReturnPath,
  sanitizeText,
  validateCredentialFields,
  validateDebtPayment,
  validateManualDebt,
  validateReportInput,
  validateReview,
  validateUploadFile,
  validateVoidReason,
} from "./validation";

const TODAY = "2026-10-13";

function report(overrides: Record<string, unknown> = {}) {
  return {
    branchId: "branch-1",
    reportDate: TODAY,
    cashPaise: 250000,
    onlinePaise: 0,
    lines: [
      { category: "finance" as const, label: "Bajaj lender", amountPaise: 100000 },
    ],
    ...overrides,
  };
}

describe("sanitizeText", () => {
  it("strips control characters, collapses whitespace and clamps length", () => {
    expect(sanitizeText("  ceiling\u0000  fan \n ", 40)).toBe("ceiling fan");
    expect(sanitizeText("x".repeat(200), MAX_LABEL_LENGTH)).toHaveLength(
      MAX_LABEL_LENGTH,
    );
    expect(sanitizeText(undefined, 10)).toBe("");
  });
});

describe("date and email helpers", () => {
  it("accepts only real ISO dates", () => {
    expect(isIsoDate("2026-10-13")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("13-10-2026")).toBe(false);
    expect(isIsoDate(20261013)).toBe(false);
  });

  it("accepts a plain address and rejects lists or display names", () => {
    expect(isValidEmail("kaza@sktapri.app")).toBe(true);
    expect(isValidEmail("SK Tapri <kaza@sktapri.app>")).toBe(false);
    expect(isValidEmail("a@b, c@d.com")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});

describe("validateCredentialFields", () => {
  it("trims the email and rejects empty input", () => {
    const ok = validateCredentialFields(" kaza@sktapri.app ", "secret");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.email).toBe("kaza@sktapri.app");

    const missingPassword = validateCredentialFields("kaza@sktapri.app", "");
    expect(missingPassword.ok).toBe(false);
  });
});

describe("validateReportInput", () => {
  it("accepts a well-formed report and normalises the labels", () => {
    const result = validateReportInput(
      report({
        lines: [
          { category: "debt", label: "  ceiling   fan ", amountPaise: 5000 },
        ],
      }),
      TODAY,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.lines[0].label).toBe("ceiling fan");
  });

  it("rejects negative, fractional and oversized amounts", () => {
    expect(validateReportInput(report({ cashPaise: -1 }), TODAY).ok).toBe(false);
    expect(validateReportInput(report({ cashPaise: 10.5 }), TODAY).ok).toBe(false);
    expect(
      validateReportInput(report({ cashPaise: MAX_AMOUNT_PAISE + 1 }), TODAY).ok,
    ).toBe(false);
  });

  it("rejects future dates, blank branches and empty reports", () => {
    expect(validateReportInput(report({ reportDate: "2026-10-14" }), TODAY).ok).toBe(
      false,
    );
    expect(validateReportInput(report({ branchId: "  " }), TODAY).ok).toBe(false);
    expect(
      validateReportInput(
        report({ cashPaise: 0, onlinePaise: 0, lines: [] }),
        TODAY,
      ).ok,
    ).toBe(false);
  });

  it("rejects unknown categories, zero amounts and blank descriptions", () => {
    expect(
      validateReportInput(
        report({ lines: [{ category: "bribes", label: "x", amountPaise: 1 }] }),
        TODAY,
      ).ok,
    ).toBe(false);
    expect(
      validateReportInput(
        report({
          lines: [{ category: "others", label: "misc", amountPaise: 0 }],
        }),
        TODAY,
      ).ok,
    ).toBe(false);
    expect(
      validateReportInput(
        report({
          lines: [{ category: "others", label: "   ", amountPaise: 500 }],
        }),
        TODAY,
      ).ok,
    ).toBe(false);
  });
});

describe("validateDebtPayment", () => {
  it("caps a payment at what is still owed", () => {
    expect(
      validateDebtPayment({ amountPaise: 2500, outstandingPaise: 1000 }).ok,
    ).toBe(false);
    const ok = validateDebtPayment({
      amountPaise: 1000,
      outstandingPaise: 1000,
      note: "  part  settlement ",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.note).toBe("part settlement");
  });

  it("rejects zero and negative payments", () => {
    expect(validateDebtPayment({ amountPaise: 0, outstandingPaise: 1000 }).ok).toBe(
      false,
    );
    expect(
      validateDebtPayment({ amountPaise: -5, outstandingPaise: 1000 }).ok,
    ).toBe(false);
  });
});

describe("validateManualDebt", () => {
  it("requires a product name, a positive amount and a sane date", () => {
    const ok = validateManualDebt(
      {
        branchId: "b1",
        productName: " Ceiling fan ",
        amountPaise: 150000,
        debtDate: TODAY,
      },
      TODAY,
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.productName).toBe("Ceiling fan");

    expect(
      validateManualDebt(
        { branchId: "b1", productName: "  ", amountPaise: 150000, debtDate: TODAY },
        TODAY,
      ).ok,
    ).toBe(false);
    expect(
      validateManualDebt(
        { branchId: "b1", productName: "Fan", amountPaise: 0, debtDate: TODAY },
        TODAY,
      ).ok,
    ).toBe(false);
    expect(
      validateManualDebt(
        { branchId: "b1", productName: "Fan", amountPaise: 100, debtDate: "2030-01-01" },
        TODAY,
      ).ok,
    ).toBe(false);
  });
});

describe("validateReview and validateVoidReason", () => {
  it("keeps a note only on a flagged report", () => {
    const concern = validateReview("concern", "  cash short by 200 ");
    expect(concern.ok).toBe(true);
    if (concern.ok) expect(concern.value.note).toBe("cash short by 200");

    const ok = validateReview("ok", "irrelevant");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.note).toBeNull();

    expect(validateReview("concern", "no").ok).toBe(false);
    expect(validateReview("approved", "fine").ok).toBe(false);
  });

  it("demands a real reason before voiding", () => {
    expect(validateVoidReason("").ok).toBe(false);
    expect(validateVoidReason("no").ok).toBe(false);
    const ok = validateVoidReason("  entered against the wrong branch ");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.reason).toBe("entered against the wrong branch");
  });
});

describe("safeReturnPath", () => {
  it("allows internal paths and refuses everything else", () => {
    expect(safeReturnPath("/admin?days=7")).toBe("/admin?days=7");
    expect(safeReturnPath("//evil.example")).toBeNull();
    expect(safeReturnPath("https://evil.example")).toBeNull();
    expect(safeReturnPath("javascript:alert(1)")).toBeNull();
    expect(safeReturnPath("/\\evil")).toBeNull();
    expect(safeReturnPath(null)).toBeNull();
  });
});

describe("validateUploadFile", () => {
  it("accepts a matching image and rejects the usual tricks", () => {
    expect(
      validateUploadFile({ name: "receipt.jpg", type: "image/jpeg", size: 20_000 }).ok,
    ).toBe(true);
    expect(
      validateUploadFile({ name: "receipt.svg", type: "image/svg+xml", size: 20_000 }).ok,
    ).toBe(false);
    expect(
      validateUploadFile({ name: "receipt.jpg", type: "image/png", size: 20_000 }).ok,
    ).toBe(false);
    expect(
      validateUploadFile({ name: "../secrets.png", type: "image/png", size: 20_000 }).ok,
    ).toBe(false);
    expect(
      validateUploadFile({ name: "receipt.png", type: "image/png", size: 0 }).ok,
    ).toBe(false);
    expect(
      validateUploadFile({ name: "receipt.png", type: "image/png", size: 50 * 1024 * 1024 })
        .ok,
    ).toBe(false);
  });
});
