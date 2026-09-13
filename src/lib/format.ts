export const CURRENCIES = [
  { code: "USD", name: "US Dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British Pound" },
  { code: "INR", name: "Indian Rupee" },
  { code: "AED", name: "UAE Dirham" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "BDT", name: "Bangladeshi Taka" },
  { code: "NGN", name: "Nigerian Naira" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
  { code: "JPY", name: "Japanese Yen" },
] as const;

export function formatCurrency(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Local-timezone "YYYY-MM-DD" for a Date (defaults to today). */
export function toDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Shift a "YYYY-MM-DD" key by n days (local-safe, no Date parsing pitfalls). */
export function shiftDateKey(key: string, days: number) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Human label for a "YYYY-MM-DD" key: "Sat, Sep 13". */
export function dateKeyLabel(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  return `${weekday}, ${MONTHS[m - 1]} ${d}`;
}

export function dateKeyRangeLabel(keys: string[]) {
  if (keys.length === 0) return "";
  const first = keys[0];
  const last = keys[keys.length - 1];
  const firstLabel = dateKeyLabel(first);
  const lastLabel = dateKeyLabel(last);
  if (first === last) return firstLabel;
  const firstYear = first.slice(0, 4);
  const lastYear = last.slice(0, 4);
  if (firstYear !== lastYear) return `${firstLabel}, ${firstYear} — ${lastLabel}, ${lastYear}`;
  if (first.slice(0, 7) === last.slice(0, 7)) {
    const [, m1, d1] = first.split("-");
    const [, m2, d2] = last.split("-");
    if (m1 === m2) return `${MONTHS[Number(m1) - 1]} ${Number(d1)}–${Number(d2)}, ${lastYear}`;
  }
  return `${firstLabel} — ${lastLabel}, ${lastYear}`;
}
