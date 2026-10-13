import { describe, it, expect } from "vitest";
import {
  toPaise,
  isNonNegativePaise,
  assertNonNegativePaise,
  paiseSum,
} from "./money";

describe("toPaise", () => {
  it("converts whole rupees exactly", () => {
    expect(toPaise(1250)).toBe(125000);
  });

  it("handles fractional rupees without float drift in storage", () => {
    expect(toPaise(1250.55)).toBe(125055);
  });

  it("rounds sub-paise fractions", () => {
    expect(toPaise(0.005)).toBe(1);
    expect(toPaise(0.004)).toBe(0);
  });

  it("rejects an unknown currency", () => {
    expect(() => toPaise(10, "XYZ")).toThrow(/Unsupported currency factor/);
  });
});

describe("non-negative paise guards", () => {
  it("accepts zero and positive integers", () => {
    expect(isNonNegativePaise(0)).toBe(true);
    expect(isNonNegativePaise(1)).toBe(true);
    expect(isNonNegativePaise(125055)).toBe(true);
  });

  it("rejects negatives, floats, and NaN", () => {
    expect(isNonNegativePaise(-1)).toBe(false);
    expect(isNonNegativePaise(1.5)).toBe(false);
    expect(isNonNegativePaise(NaN)).toBe(false);
    expect(isNonNegativePaise(Infinity)).toBe(false);
  });

  it("throws on invalid amounts", () => {
    expect(() => assertNonNegativePaise(-5, "cash")).toThrow(
      /cash must be a non-negative integer paise amount/,
    );
    expect(() => assertNonNegativePaise(1.5, "online")).toThrow(
      /online must be a non-negative integer paise amount/,
    );
  });
});

describe("paiseSum", () => {
  it("sums several sections of a daily report", () => {
    const sections = [
      100000, // cash
      25000, // online
      15000, // finance
      20000, // debt
      5000, // exchange
      4000, // cheque
      5000, // store use
      6000, // others
    ];
    expect(paiseSum(sections)).toBe(180000);
  });

  it("preserves integer precision across many adds", () => {
    const big = Array.from({ length: 100 }, () => 12345);
    expect(paiseSum(big)).toBe(1234500);
  });

  it("rejects a negative section inside a sum", () => {
    expect(() => paiseSum([100, -5])).toThrow(/sum value/);
  });
});
