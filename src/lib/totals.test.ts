import { describe, it, expect } from "vitest";
import { computeTotalSale } from "./totals";

const EMPTY = {
  cash: 0,
  online: 0,
  finance: 0,
  debt: 0,
  exchange: 0,
  cheque: 0,
  store_use: 0,
  others: 0,
};

describe("computeTotalSale", () => {
  it("matches the spec formula with all 8 sections", () => {
    expect(
      computeTotalSale({
        cash: 100000,
        online: 25000,
        finance: 15000,
        debt: 20000,
        exchange: 5000,
        cheque: 4000,
        store_use: 5000,
        others: 6000,
      }),
    ).toBe(180000);
  });

  it("handles an empty day", () => {
    expect(computeTotalSale(EMPTY)).toBe(0);
  });

  it("rejects a negative section", () => {
    expect(() => computeTotalSale({ ...EMPTY, cash: -100 })).toThrow(
      /cash must be a non-negative integer paise amount/,
    );
  });

  it("rejects a fractional section", () => {
    expect(() => computeTotalSale({ ...EMPTY, cash: 100.5 })).toThrow(
      /cash must be a non-negative integer paise amount/,
    );
  });
});
