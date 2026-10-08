import { describe, it, expect } from "vitest";
import {
  computeTotalSale,
  validateAndRecomputeTotalSale,
  isFinanceRowValid,
  isDebtRowValid,
  isOtherRowValid,
} from "./totals";

describe("computeTotalSale", () => {
  it("matches the spec formula with all 8 sections", () => {
    const sections = {
      cash: 100000,
      online: 25000,
      finance: 15000,
      debt: 20000,
      exchange: 5000,
      cheque: 4000,
      store_use: 5000,
      others: 6000,
    };
    expect(computeTotalSale(sections)).toBe(180000);
  });

  it("handles an empty day", () => {
    expect(
      computeTotalSale({
        cash: 0,
        online: 0,
        finance: 0,
        debt: 0,
        exchange: 0,
        cheque: 0,
        store_use: 0,
        others: 0,
      }),
    ).toBe(0);
  });

  it("rejects a negative section", () => {
    expect(() =>
      computeTotalSale({
        cash: -100,
        online: 0,
        finance: 0,
        debt: 0,
        exchange: 0,
        cheque: 0,
        store_use: 0,
        others: 0,
      }),
    ).toThrow(/cash must be a non-negative integer paise amount/);
  });

  it("rejects a fractional section", () => {
    expect(() =>
      computeTotalSale({
        cash: 100.5,
        online: 0,
        finance: 0,
        debt: 0,
        exchange: 0,
        cheque: 0,
        store_use: 0,
        others: 0,
      }),
    ).toThrow(/cash must be a non-negative integer paise amount/);
  });
});

describe("validateAndRecomputeTotalSale", () => {
  it("returns the recomputed total when it matches client total", () => {
    const sections = {
      cash: 50000,
      online: 25000,
      finance: 0,
      debt: 0,
      exchange: 0,
      cheque: 0,
      store_use: 0,
      others: 0,
      clientTotal: 75000,
    };
    expect(validateAndRecomputeTotalSale(sections)).toBe(75000);
  });

  it("throws on mismatch", () => {
    const sections = {
      cash: 50000,
      online: 25000,
      finance: 0,
      debt: 0,
      exchange: 0,
      cheque: 0,
      store_use: 0,
      others: 0,
      clientTotal: 74999,
    };
    expect(() => validateAndRecomputeTotalSale(sections)).toThrow(
      /Total mismatch:/,
    );
  });
});

describe("row validators", () => {
  it("accepts valid finance rows", () => {
    expect(isFinanceRowValid("Gold chain", 25000)).toBe(true);
  });

  it("rejects blank labels and negative amounts", () => {
    expect(isFinanceRowValid("", 100)).toBe(false);
    expect(isFinanceRowValid("item", -1)).toBe(false);
  });

  it("accepts valid debt rows", () => {
    expect(isDebtRowValid("Bag", 50000)).toBe(true);
  });

  it("accepts valid other rows", () => {
    expect(isOtherRowValid("Misc packing material", 500)).toBe(true);
  });
});
