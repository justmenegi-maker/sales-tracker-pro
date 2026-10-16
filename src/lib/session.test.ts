import { describe, it, expect } from "vitest";
import {
  accountState,
  accountStateCopy,
  accountStateReason,
  normalizeSession,
} from "./session";

describe("normalizeSession", () => {
  it("keeps a complete session as it is", () => {
    const session = normalizeSession({
      id: "user-1",
      email: "kaza@sktapri.app",
      displayName: "SK Kaza",
      role: "branch",
      branchId: "branch_kaza",
      emailVerified: true,
      hasProfile: true,
      isActive: true,
      signInProvider: "email",
    });

    expect(session).toEqual({
      id: "user-1",
      email: "kaza@sktapri.app",
      displayName: "SK Kaza",
      role: "branch",
      branchId: "branch_kaza",
      emailVerified: true,
      hasProfile: true,
      isActive: true,
      signInProvider: "email",
    });
  });

  it("fills the fields an older build never wrote", () => {
    // The shape a demo login saved before `hasProfile`/`isActive` existed: this
    // is the regression that showed a signed-in branch "Account not linked yet"
    // and stopped it filing a report.
    const session = normalizeSession({
      id: "demo_branch",
      email: "kaza@sktapri.app",
      displayName: "SK Kaza",
      role: "branch",
      branchId: "branch_kaza",
    });

    expect(session).not.toBeNull();
    expect(session?.hasProfile).toBe(true);
    expect(session?.isActive).toBe(true);
    expect(session?.emailVerified).toBe(true);
    expect(session?.signInProvider).toBe("email");
    expect(accountState(session!)).toBe("ready");
  });

  it("still honours an explicit false, so a switched-off profile stays off", () => {
    const session = normalizeSession({
      id: "user-2",
      email: "kaza@sktapri.app",
      displayName: "SK Kaza",
      role: "branch",
      branchId: "branch_kaza",
      hasProfile: false,
      isActive: false,
    });

    expect(session?.hasProfile).toBe(false);
    expect(session?.isActive).toBe(false);
    expect(accountState(session!)).toBe("unlinked");
  });

  it("refuses a record that cannot identify the account, and anything not an object", () => {
    expect(normalizeSession({ email: "kaza@sktapri.app" })).toBeNull();
    expect(normalizeSession({ id: "" })).toBeNull();
    expect(normalizeSession(null)).toBeNull();
    expect(normalizeSession("demo_branch")).toBeNull();
    expect(normalizeSession(42)).toBeNull();
  });

  it("repairs a blank branchId and an unknown role", () => {
    const session = normalizeSession({
      id: "user-3",
      email: "",
      displayName: "",
      role: "owner",
      branchId: "",
    });

    expect(session?.role).toBe("branch");
    expect(session?.branchId).toBeNull();
    expect(session?.displayName).toBe("Signed in");
  });
});

describe("accountState", () => {
  const base = {
    hasProfile: true,
    isActive: true,
    role: "branch" as const,
    branchId: "branch_kaza",
  };

  it("is ready for a linked, active branch login", () => {
    expect(accountState(base)).toBe("ready");
  });

  it("is ready for an admin, which has no branch", () => {
    expect(accountState({ ...base, role: "admin", branchId: null })).toBe("ready");
  });

  it("names the missing piece", () => {
    expect(accountState({ ...base, hasProfile: false, branchId: null })).toBe("unlinked");
    expect(accountState({ ...base, isActive: false })).toBe("inactive");
    expect(accountState({ ...base, branchId: null })).toBe("no-branch");
  });

  it("checks the profile before the branch, so the first problem is the one shown", () => {
    expect(accountState({ ...base, hasProfile: false, isActive: false, branchId: null })).toBe(
      "unlinked",
    );
  });
});

describe("accountStateCopy", () => {
  it("tells the user what to do, and names the account", () => {
    for (const state of ["unlinked", "no-branch", "inactive"] as const) {
      const copy = accountStateCopy(state, "kaza@sktapri.app");
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body).toContain("kaza@sktapri.app");
      expect(copy.body).toContain("admin");
    }
  });

  it("still reads well without an email", () => {
    expect(accountStateCopy("unlinked", "").body).toContain("This account");
  });
});

describe("accountStateReason", () => {
  it("is null for a login that may file, and the message otherwise", () => {
    const ready = normalizeSession({
      id: "demo_branch",
      email: "kaza@sktapri.app",
      displayName: "SK Kaza",
      role: "branch",
      branchId: "branch_kaza",
    })!;
    expect(accountStateReason(ready)).toBeNull();

    const branchless = normalizeSession({
      id: "user-4",
      email: "kaza@sktapri.app",
      displayName: "SK Kaza",
      role: "branch",
      branchId: null,
    })!;
    expect(accountStateReason(branchless)).toBe(
      accountStateCopy("no-branch", "kaza@sktapri.app").body,
    );
  });
});
