/**
 * Input validation for everything the browser can send.
 *
 * Every value that leaves the UI is checked and normalised here before it is
 * handed to the store, so a caller cannot submit a negative amount, a future
 * date, an over-long note or a label full of control characters. The database
 * re-checks the same rules in `supabase/migrations/006_security_hardening.sql`
 * (constraints + triggers) — this module is the friendly first line, not the
 * only one.
 */
import type { LineCategory, SaveReportInput } from "./report";

/** ₹1 billion in paise. The database allows a little more, this is the UI fence. */
export const MAX_AMOUNT_PAISE = 100_000_000_000;
export const MAX_LINES_PER_REPORT = 100;
export const MAX_LABEL_LENGTH = 120;
export const MAX_NOTE_LENGTH = 500;
export const MAX_PAYMENT_NOTE_LENGTH = 200;
export const MAX_PRODUCT_NAME_LENGTH = 80;
export const MAX_EMAIL_LENGTH = 254;
export const MIN_CONCERN_NOTE_LENGTH = 3;

export const LINE_CATEGORIES: LineCategory[] = [
  "finance",
  "debt",
  "exchange",
  "cheque",
  "store_use",
  "others",
];

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function fail<T>(...errors: string[]): ValidationResult<T> {
  return { ok: false, errors };
}

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;

/**
 * Trims, strips control characters and collapses runs of whitespace, then
 * clamps to `maxLength`. Rendering stays safe either way (React escapes text),
 * this keeps stored data tidy and bounded.
 */
export function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** True for an integer count of paise inside the allowed range. */
export function isValidAmountPaise(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_AMOUNT_PAISE
  );
}

/** `YYYY-MM-DD` and a real calendar date. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** Rejects dates in the future and dates before the app existed. */
export function isSaneReportDate(value: unknown, today: string): value is string {
  if (!isIsoDate(value) || !isIsoDate(today)) return false;
  return value <= today && value >= "2015-01-01";
}

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const email = value.trim();
  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH) return false;
  if (/[\s\u0000-\u001f]/.test(email)) return false;
  // Deliberately simple: one @, a dotted domain, no display name or comma list.
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(email);
}

/** Login/password fields: present, bounded, no leading/trailing surprises. */
export function validateCredentialFields(
  email: unknown,
  password: unknown,
): ValidationResult<{ email: string; password: string }> {
  const errors: string[] = [];
  const cleanEmail = typeof email === "string" ? email.trim() : "";
  if (!isValidEmail(cleanEmail)) errors.push("Enter a valid email address.");
  if (typeof password !== "string" || password.length === 0) {
    errors.push("Enter your password.");
  } else if (password.length > 256) {
    errors.push("That password is too long.");
  }
  if (errors.length > 0) return fail(...errors);
  return { ok: true, value: { email: cleanEmail, password: password as string } };
}

export type SanitizedReportInput = {
  branchId: string;
  reportDate: string;
  cashPaise: number;
  onlinePaise: number;
  lines: Array<{ category: LineCategory; label: string; amountPaise: number }>;
};

/** Report submission: branch, date, amounts and every line. */
export function validateReportInput(
  input: SaveReportInput,
  today: string,
): ValidationResult<SanitizedReportInput> {
  const errors: string[] = [];

  const branchId = sanitizeText(input.branchId, 64);
  if (branchId.length === 0) errors.push("Pick a branch before submitting.");

  const reportDate = typeof input.reportDate === "string" ? input.reportDate.trim() : "";
  if (!isSaneReportDate(reportDate, today)) {
    errors.push("Pick a report date that is today or earlier.");
  }

  if (!isValidAmountPaise(input.cashPaise)) errors.push("Cash must be a valid amount.");
  if (!isValidAmountPaise(input.onlinePaise)) errors.push("Online must be a valid amount.");

  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (rawLines.length > MAX_LINES_PER_REPORT) {
    errors.push(`A report can hold at most ${MAX_LINES_PER_REPORT} rows.`);
  }

  const lines: SanitizedReportInput["lines"] = [];
  rawLines.slice(0, MAX_LINES_PER_REPORT).forEach((line, index) => {
    const position = index + 1;
    if (!LINE_CATEGORIES.includes(line.category)) {
      errors.push(`Row ${position}: unknown category.`);
      return;
    }
    if (!isValidAmountPaise(line.amountPaise) || line.amountPaise <= 0) {
      errors.push(`Row ${position}: enter an amount greater than zero.`);
      return;
    }
    const label = sanitizeText(line.label, MAX_LABEL_LENGTH);
    if (label.length === 0) {
      errors.push(`Row ${position}: add a short description.`);
      return;
    }
    lines.push({ category: line.category, label, amountPaise: line.amountPaise });
  });

  const total =
    (typeof input.cashPaise === "number" ? input.cashPaise : 0) +
    (typeof input.onlinePaise === "number" ? input.onlinePaise : 0) +
    lines.reduce((sum, line) => sum + line.amountPaise, 0);
  if (total <= 0) errors.push("Add at least one amount before submitting.");

  if (errors.length > 0) return fail(...errors);
  return {
    ok: true,
    value: {
      branchId,
      reportDate: reportDate as string,
      cashPaise: input.cashPaise as number,
      onlinePaise: input.onlinePaise as number,
      lines,
    },
  };
}

/** A debt payment against one ledger entry. */
export function validateDebtPayment(input: {
  amountPaise: number;
  note?: string;
  outstandingPaise: number;
}): ValidationResult<{ amountPaise: number; note: string | null }> {
  const errors: string[] = [];
  if (
    typeof input.amountPaise !== "number" ||
    !Number.isSafeInteger(input.amountPaise) ||
    input.amountPaise <= 0
  ) {
    errors.push("Enter the amount received (more than zero).");
  } else if (
    Number.isSafeInteger(input.outstandingPaise) &&
    input.outstandingPaise >= 0 &&
    input.amountPaise > input.outstandingPaise
  ) {
    errors.push("That is more than what is still owed on this debt.");
  }

  const note = sanitizeText(input.note ?? "", MAX_PAYMENT_NOTE_LENGTH);
  if (errors.length > 0) return fail(...errors);
  return { ok: true, value: { amountPaise: input.amountPaise, note: note || null } };
}

/** A hand-entered debt. */
export function validateManualDebt(
  input: {
    branchId: string;
    productName: string;
    amountPaise: number;
    debtDate: string;
  },
  today: string,
): ValidationResult<{
  branchId: string;
  productName: string;
  amountPaise: number;
  debtDate: string;
}> {
  const errors: string[] = [];
  const branchId = sanitizeText(input.branchId, 64);
  if (branchId.length === 0) errors.push("No branch available for this debt.");

  const productName = sanitizeText(input.productName, MAX_PRODUCT_NAME_LENGTH);
  if (productName.length === 0) errors.push("Add a product name for the debt.");

  if (
    typeof input.amountPaise !== "number" ||
    !Number.isSafeInteger(input.amountPaise) ||
    input.amountPaise <= 0 ||
    input.amountPaise > MAX_AMOUNT_PAISE
  ) {
    errors.push("Add a debt amount greater than zero.");
  }

  if (!isSaneReportDate(input.debtDate, today)) {
    errors.push("Pick a debt date that is today or earlier.");
  }

  if (errors.length > 0) return fail(...errors);
  return {
    ok: true,
    value: {
      branchId,
      productName,
      amountPaise: input.amountPaise,
      debtDate: input.debtDate,
    },
  };
}

/** Admin review: tick OK, or flag a concern with a real note. */
export function validateReview(
  status: unknown,
  note: unknown,
): ValidationResult<{ status: "pending" | "ok" | "concern"; note: string | null }> {
  if (status !== "pending" && status !== "ok" && status !== "concern") {
    return fail("Unknown review status.");
  }
  const clean = sanitizeText(note, MAX_NOTE_LENGTH);
  if (status === "concern" && clean.length < MIN_CONCERN_NOTE_LENGTH) {
    return fail("Add a short note explaining the concern.");
  }
  return { ok: true, value: { status, note: status === "concern" ? clean : null } };
}

/** Voiding a filed report: an admin must say why. */
export function validateVoidReason(
  reason: unknown,
): ValidationResult<{ reason: string }> {
  const clean = sanitizeText(reason, MAX_NOTE_LENGTH);
  if (clean.length < MIN_CONCERN_NOTE_LENGTH) {
    return fail("Give a reason for voiding this report.");
  }
  return { ok: true, value: { reason: clean } };
}

/**
 * Only ever redirect to a path inside this app. Anything absolute,
 * protocol-relative or containing a scheme is dropped.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (CONTROL_CHARS.test(value)) return null;
  if (value.length > 200) return null;
  return value;
}

/** Upload guardrails. There is no upload surface yet; this is the rule to use. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export function validateUploadFile(input: {
  name: unknown;
  type: unknown;
  size: unknown;
}): ValidationResult<{ name: string; type: string; size: number }> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const type = typeof input.type === "string" ? input.type.toLowerCase() : "";
  const size = typeof input.size === "number" ? input.size : Number.NaN;

  if (name.length === 0 || name.length > 120) return fail("That file name is not allowed.");
  if (CONTROL_CHARS.test(name) || name.includes("/") || name.includes("\\") || name.includes("..")) {
    return fail("That file name is not allowed.");
  }
  if (!Number.isFinite(size) || size <= 0) return fail("That file is empty.");
  if (size > MAX_UPLOAD_BYTES) {
    return fail(`Files must be ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB or smaller.`);
  }
  const allowedExtensions = ALLOWED_UPLOAD_TYPES[type];
  if (!allowedExtensions) {
    return fail("Only JPEG, PNG, WebP or PDF files are accepted.");
  }
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    return fail("The file extension does not match its content type.");
  }
  return { ok: true, value: { name, type, size } };
}
