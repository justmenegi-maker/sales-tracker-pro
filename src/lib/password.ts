/**
 * Password policy.
 *
 * Deliberately harsh: 12 characters minimum, every character class, no
 * keyboard walks, no repeats, nothing personal (your email or display name),
 * and nothing from the common-password list. Supabase (bcrypt) ignores
 * anything past 72 bytes, so that is the ceiling.
 *
 * There is no self-service sign-up in this app — an admin creates logins — so
 * this policy is enforced when an invited user sets a password and whenever a
 * signed-in user changes theirs. Also turn on the matching rule in the
 * Supabase dashboard (Authentication → Providers → Email → minimum password
 * length and strength), which is the check the server itself trusts.
 */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "passw0rd",
  "p@ssw0rd",
  "qwerty",
  "qwerty123",
  "qwertyuiop",
  "letmein",
  "welcome",
  "welcome1",
  "admin",
  "admin123",
  "administrator",
  "iloveyou",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "sunshine",
  "princess",
  "abc123",
  "abcd1234",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "1234567890",
  "111111",
  "000000",
  "changeme",
  "secret",
  "sktapri",
  "sktapri123",
]);

const KEYBOARD_ROWS = [
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "1234567890",
];

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function hasRun(value: string, length: number): boolean {
  const lower = value.toLowerCase();
  for (let index = 0; index + length <= lower.length; index += 1) {
    const slice = lower.slice(index, index + length);
    if (/^(.)\1+$/.test(slice)) return true;
    const ascending = slice
      .split("")
      .every((char, offset) =>
        offset === 0
          ? true
          : char.charCodeAt(0) === slice.charCodeAt(offset - 1) + 1,
      );
    const descending = slice
      .split("")
      .every((char, offset) =>
        offset === 0
          ? true
          : char.charCodeAt(0) === slice.charCodeAt(offset - 1) - 1,
      );
    if (ascending || descending) return true;
  }
  return false;
}

function hasKeyboardWalk(value: string): boolean {
  const lower = value.toLowerCase();
  return KEYBOARD_ROWS.some((row) => {
    for (let index = 0; index + 4 <= row.length; index += 1) {
      const chunk = row.slice(index, index + 4);
      if (lower.includes(chunk) || lower.includes([...chunk].reverse().join(""))) {
        return true;
      }
    }
    return false;
  });
}

/** Every reason the password is not acceptable. Empty array means it is fine. */
export function passwordIssues(
  password: string,
  personal: { email?: string; displayName?: string } = {},
): string[] {
  const issues: string[] = [];

  if (byteLength(password) < MIN_PASSWORD_LENGTH) {
    issues.push(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (byteLength(password) > MAX_PASSWORD_BYTES) {
    issues.push(`Keep it under ${MAX_PASSWORD_BYTES} characters.`);
  }
  if (!/[a-z]/.test(password)) issues.push("Add a lowercase letter.");
  if (!/[A-Z]/.test(password)) issues.push("Add an uppercase letter.");
  if (!/[0-9]/.test(password)) issues.push("Add a number.");
  if (!/[^A-Za-z0-9]/.test(password)) issues.push("Add a symbol.");
  if (/\s/.test(password)) issues.push("Spaces are not allowed.");
  if (hasRun(password, 3)) issues.push("Avoid repeated or sequential characters.");
  if (hasKeyboardWalk(password)) issues.push("Avoid keyboard patterns like qwerty.");

  const lower = password.toLowerCase();
  // "P@ssw0rd123!" and friends only differ by decoration, so compare the
  // stripped form as well before giving up on the list.
  const stripped = lower.replace(/[^a-z0-9]/g, "");
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(stripped)) {
    issues.push("That password is too common.");
  }
  if (lower.includes("sktapri") || lower.includes("password")) {
    issues.push("Do not use the product name or the word “password”.");
  }

  const localPart = (personal.email ?? "").split("@")[0]?.toLowerCase() ?? "";
  if (localPart.length >= 4 && lower.includes(localPart)) {
    issues.push("Do not use your email address in the password.");
  }

  const nameParts = (personal.displayName ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 4);
  const joinedName = (personal.displayName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const usesName =
    (joinedName.length >= 6 && lower.includes(joinedName)) ||
    nameParts.some((part) => lower.includes(part));
  if (usesName) {
    issues.push("Do not use your name in the password.");
  }

  return issues;
}

export function isStrongPassword(
  password: string,
  personal?: { email?: string; displayName?: string },
): boolean {
  return passwordIssues(password, personal).length === 0;
}

/** 0 (hopeless) to 4 (strong); drives the meter in the UI. */
export function passwordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (password.length === 0) return { score: 0, label: "Empty" };

  let points = 0;
  if (byteLength(password) >= MIN_PASSWORD_LENGTH) points += 1;
  if (byteLength(password) >= 16) points += 1;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) =>
    pattern.test(password),
  ).length;
  points += Math.max(0, classes - 1);
  if (hasRun(password, 3) || hasKeyboardWalk(password) || COMMON_PASSWORDS.has(password.toLowerCase())) {
    points = Math.min(points, 1);
  }

  const score = Math.max(0, Math.min(4, points)) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] };
}

/** Short, user-facing rules used by the UI checklist. */
export const PASSWORD_RULES: Array<{ label: string; test: (value: string) => boolean }> = [
  {
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (value) => byteLength(value) >= MIN_PASSWORD_LENGTH,
  },
  { label: "Upper and lower case", test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: "A number", test: (value) => /[0-9]/.test(value) },
  { label: "A symbol", test: (value) => /[^A-Za-z0-9]/.test(value) },
  {
    label: "No names, words or patterns",
    test: (value) =>
      !COMMON_PASSWORDS.has(value.toLowerCase()) &&
      !hasRun(value, 3) &&
      !hasKeyboardWalk(value),
  },
];
