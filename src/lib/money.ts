/**
 * Money helpers for SK Tapri app.
 *
 * Money is always stored as integer paise. Never use floating money in
 * business logic, totals, or DB payloads.
 */

export type Paise = number;

export const INRHS = "INR";
export const PAISE_PER_UNIT: Record<string, number> = {
  INR: 100,
};

export function toPaise(amount: number, currency = INRHS): Paise {
  const factor = PAISE_PER_UNIT[currency];
  if (!Number.isInteger(factor)) {
    throw new Error(`Unsupported currency factor for ${currency}`);
  }
  const scaled = amount * factor;
  // Avoid float drift by rounding to the nearest integer paise.
  return Math.round(scaled);
}

export function fromPaise(paise: Paise, currency = INRHS): number {
  const factor = PAISE_PER_UNIT[currency];
  if (!Number.isInteger(factor)) {
    throw new Error(`Unsupported currency factor for ${currency}`);
  }
  return paise / factor;
}

export function isNonNegativePaise(value: number): value is Paise {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

export function assertNonNegativePaise(value: number, label = "amount"): Paise {
  if (!isNonNegativePaise(value)) {
    throw new Error(`${label} must be a non-negative integer paise amount`);
  }
  return value;
}

export function paiseSum(values: Iterable<number>): Paise {
  let total = 0;
  for (const v of values) {
    assertNonNegativePaise(v, "sum value");
    total += v;
  }
  // Paise values are integers; guard against accidental float accumulation.
  return Math.round(total);
}

export function paiseMax(...values: number[]): Paise {
  return paiseSum(values);
}

export const ZERO_PAISE = 0;
