/**
 * Formatting helpers for SK Tapri.
 *
 * All money in the app is integer paise; these helpers are the only place that
 * converts to a display string, so the UI never invents its own number format.
 */
import { assertNonNegativePaise, toPaise } from "./money";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** ₹1,250.55 */
export function formatINR(paise: number): string {
  return inr.format(assertNonNegativePaise(paise) / 100);
}

/** ₹1,251 — for totals where paise noise is not useful. */
export function formatINRWhole(paise: number): string {
  return inrWhole.format(assertNonNegativePaise(paise) / 100);
}

/** ₹1.25L / ₹12.5k / ₹480 — for compact dashboard tiles. */
export function formatINRCompact(paise: number): string {
  const rupees = assertNonNegativePaise(paise) / 100;
  const sign = "₹";
  if (rupees >= 10_000_000) return `${sign}${trim(rupees / 10_000_000)}Cr`;
  if (rupees >= 100_000) return `${sign}${trim(rupees / 100_000)}L`;
  if (rupees >= 1_000) return `${sign}${trim(rupees / 1_000)}k`;
  return `${sign}${Math.round(rupees)}`;
}

function trim(value: number): string {
  return value.toFixed(value >= 100 ? 0 : 1).replace(/\.0$/, "");
}

/**
 * Parse a rupee amount typed by a user ("1,250.50", "₹1250") into paise.
 * Returns null for anything that is not a valid non-negative amount.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return toPaise(value);
}

/** Today in the shop's timezone, as yyyy-mm-dd. */
export function todayISO(): string {
  const timeZone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

/** "13 Oct 2026" from yyyy-mm-dd. */
export function formatDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const weekdayFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  timeZone: "UTC",
});

// Trend charts ask for the same handful of days on every render, and Intl
// formatting is the expensive part, so keep the labels.
const weekdayLabels = new Map<string, string>();

/** "Mon" from yyyy-mm-dd. */
export function formatWeekdayShort(isoDate: string): string {
  const cached = weekdayLabels.get(isoDate);
  if (cached !== undefined) return cached;

  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return "";

  const label = weekdayFormat.format(new Date(Date.UTC(year, month - 1, day)));
  weekdayLabels.set(isoDate, label);
  return label;
}

/** Shift a yyyy-mm-dd date by whole days. */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const base = Date.UTC(year, month - 1, day);
  const next = new Date(base + days * 86_400_000);
  return next.toISOString().slice(0, 10);
}
