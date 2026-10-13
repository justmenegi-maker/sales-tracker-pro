/**
 * Money helpers for SK Tapri.
 *
 * Money is always stored as integer paise. Never use floating money in
 * business logic, totals, or DB payloads.
 */

export type Paise = number;

const INR = "INR";

/** Minor units per major unit, by currency. */
const PAISE_PER_UNIT: Record<string, number> = {
  INR: 100,
};

/** Rupees (possibly fractional, e.g. from a form) into integer paise. */
export function toPaise(amount: number, currency = INR): Paise {
  const factor = PAISE_PER_UNIT[currency];
  if (!Number.isInteger(factor)) {
    throw new Error(`Unsupported currency factor for ${currency}`);
  }
  const scaled = amount * factor;
  // Avoid float drift by rounding to the nearest integer paise.
  return Math.round(scaled);
}

export function isNonNegativePaise(value: number): value is Paise {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isInteger(value)
  );
}

export function assertNonNegativePaise(value: number, label = "amount"): Paise {
  if (!isNonNegativePaise(value)) {
    throw new Error(`${label} must be a non-negative integer paise amount`);
  }
  return value;
}

export function paiseSum(values: Iterable<number>): Paise {
  let total = 0;
  for (const value of values) {
    assertNonNegativePaise(value, "sum value");
    total += value;
  }
  // Paise values are integers; guard against accidental float accumulation.
  return Math.round(total);
}
