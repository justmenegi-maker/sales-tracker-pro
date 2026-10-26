import { describe, it, expect } from "vitest";
import {
  addDays,
  formatDateLabel,
  formatINR,
  formatINRCompact,
  formatINRSigned,
  formatINRWhole,
  formatINRWholeSigned,
  formatWeekdayShort,
  parseRupeesToPaise,
} from "./format";

describe("parseRupeesToPaise", () => {
  it("parses plain and decorated rupee amounts", () => {
    expect(parseRupeesToPaise("1250")).toBe(125000);
    expect(parseRupeesToPaise("1,250.50")).toBe(125050);
    expect(parseRupeesToPaise("₹ 1250.5")).toBe(125050);
    expect(parseRupeesToPaise("0.05")).toBe(5);
  });

  it("rejects malformed or out-of-range input", () => {
    expect(parseRupeesToPaise("")).toBeNull();
    expect(parseRupeesToPaise("12.345")).toBeNull();
    expect(parseRupeesToPaise("12a")).toBeNull();
    expect(parseRupeesToPaise("-20")).toBeNull();
  });
});

describe("formatINR", () => {
  it("formats paise as Indian rupees", () => {
    expect(formatINR(125055)).toContain("1,250.55");
    expect(formatINR(0)).toContain("0.00");
    expect(formatINRWhole(125055)).toContain("1,251");
  });

  it("compacts large amounts for tiles", () => {
    expect(formatINRCompact(12500000)).toBe("₹1.3L");
    expect(formatINRCompact(7190000)).toBe("₹71.9k");
    expect(formatINRCompact(48000)).toBe("₹480");
  });

  it("formats a derived net, including when expenses exceed the sale", () => {
    expect(formatINRSigned(125055)).toContain("1,250.55");
    expect(formatINRSigned(0)).toContain("0.00");
    expect(formatINRSigned(-400000)).toBe("-₹4,000.00");
    expect(formatINRWholeSigned(-400055)).toBe("-₹4,001");
    expect(formatINRWholeSigned(125055)).toContain("1,251");
    expect(() => formatINRSigned(12.5)).toThrow(/integer paise/);
    expect(() => formatINRSigned(Number.NaN)).toThrow(/integer paise/);
  });
});

describe("date helpers", () => {
  it("shifts days across month and year boundaries", () => {
    expect(addDays("2026-10-13", -13)).toBe("2026-09-30");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("labels dates without timezone drift", () => {
    expect(formatDateLabel("2026-10-13")).toBe("13 Oct 2026");
    expect(formatWeekdayShort("2026-10-13")).toBe("Tue");
  });
});
