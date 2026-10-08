import { describe, it, expect } from "vitest";
import {
  toPaise,
  fromPaise,
  isNonNegativePaise,
  assertNonNegativePaise,
  paiseSum,
  ZERO_PAISE,
} from "./money";

describe("toPaise/fromPaise", () => {
  it("round-trips whole rupees exactly", () => {
    expect(fromPaise(toPaise(1250), "INR")).toBe(1250);
  });

  it("handles fractional rupees without float drift in storage", () => {
    const paise = toPaise(1250.55, "INR");
    expect(paise).toBe(125055);
    expect(fromPaise(paise, "INR")).toBe(1250.55);
  });

  it("rounds .005 paise correctly", () => {
    expect(toPaise(0.005, "INR")).toBe(1);
    expect(toPaise(0.004, "INR")).toBe(0);
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

describe("ZERO_PAISE constant", () => {
  it("is a non-negative integer paise value", () => {
    expect(ZERO_PAISE).toBe(0);
    expect(isNonNegativePaise(ZERO_PAISE)).toBe(true);
  });
});
