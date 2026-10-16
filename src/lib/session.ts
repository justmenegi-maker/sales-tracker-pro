/**
 * The signed-in account, and whether it is allowed to use the workspace.
 *
 * Two things matter here:
 *
 *  1. **A stored session can be older than the code.** Demo sessions live in
 *     `localStorage`, and every field added to this shape after the fact (the
 *     verification flag, `hasProfile`, the sign-in provider) was missing from
 *     sessions written by an earlier build. Reading those back without
 *     normalising them turned a working branch login into "Account not linked
 *     yet" the moment the app was updated — a branch that cannot file its daily
 *     report. `normalizeSession()` fills the gaps with the permissive default,
 *     so only the database can say "this account is switched off".
 *
 *  2. **The database is the authority.** Row-level security only lets a branch
 *     file for the branch its `profiles` row points at, and `is_admin()` /
 *     `current_branch_id()` both require `is_active`. The client mirrors those
 *     two rules so the user gets a sentence instead of a policy violation:
 *     see `accountState()` and `accountStateCopy()`.
 */

export type AccountRole = "admin" | "branch";

export type Session = {
  id: string;
  email: string;
  displayName: string;
  role: AccountRole;
  branchId: string | null;
  /** Supabase has confirmed the address (always true in demo mode). */
  emailVerified: boolean;
  /**
   * A `profiles` row exists for this account. A Google sign-in can create an
   * auth user nobody has linked to a branch yet, and row-level security means
   * that account can see nothing until an admin adds it.
   */
  hasProfile: boolean;
  /** The `profiles` row is active. RLS treats an inactive profile as no access. */
  isActive: boolean;
  /** How this account signs in: "email" for a password, otherwise the provider. */
  signInProvider: string;
};

/** A session as it may have been written by an older build. */
export type StoredSession = Partial<Omit<Session, "id">> & { id?: unknown };

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads a persisted session, tolerating missing fields.
 *
 * Returns `null` only when the record is unusable (no id), which is exactly the
 * case where the login has to happen again. Booleans default to *true*: a
 * stored session was written by a build that had already accepted the account,
 * and refusing it would lock a working branch out of its own report form.
 */
export function normalizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as StoredSession;
  const id = nonEmpty(value.id);
  if (!id) return null;

  const email = typeof value.email === "string" ? value.email : "";
  const displayName = nonEmpty(value.displayName) ?? (email || "Signed in");

  return {
    id,
    email,
    displayName,
    role: value.role === "admin" ? "admin" : "branch",
    branchId: nonEmpty(value.branchId),
    emailVerified: value.emailVerified !== false,
    hasProfile: value.hasProfile !== false,
    isActive: value.isActive !== false,
    signInProvider: nonEmpty(value.signInProvider) ?? "email",
  };
}

/** Why an account cannot use the workspace, or "ready" when it can. */
export type AccountState = "ready" | "unlinked" | "inactive" | "no-branch";

/**
 * The account-level gate, mirroring what RLS would do anyway.
 *
 * `no-branch` is the quiet one that used to go unnoticed: a profile with
 * `role = 'branch'` and no `branch_id` opens a workspace whose form points at
 * another branch, and then every submission is refused. Better to say so.
 */
export function accountState(session: {
  hasProfile: boolean;
  isActive: boolean;
  role: AccountRole;
  branchId: string | null;
}): AccountState {
  if (!session.hasProfile) return "unlinked";
  if (!session.isActive) return "inactive";
  if (session.role === "branch" && !session.branchId) return "no-branch";
  return "ready";
}

/** Title and body for the card (and for the write refusal) of a state. */
export function accountStateCopy(
  state: Exclude<AccountState, "ready">,
  email: string,
): { title: string; body: string } {
  const who = email.length > 0 ? email : "This account";
  switch (state) {
    case "unlinked":
      return {
        title: "Account not linked yet",
        body: `${who} is signed in, but no branch or admin profile exists for it. Ask an admin to link your email to a branch — until then there is nothing this account is allowed to file or see.`,
      };
    case "no-branch":
      return {
        title: "No branch linked to this login",
        body: `${who} has a branch profile, but it does not point at a branch yet. Ask an admin to link it to your branch — the daily report can only be filed for the branch your login belongs to.`,
      };
    case "inactive":
      return {
        title: "This login is switched off",
        body: `${who} is signed in, but its profile is inactive, so the database refuses every read and write. Ask an admin to make the profile active again.`,
      };
  }
}

/** The reason a write was refused, ready to show the user as-is. */
export function accountStateReason(session: Session): string | null {
  const state = accountState(session);
  if (state === "ready") return null;
  return accountStateCopy(state, session.email).body;
}
