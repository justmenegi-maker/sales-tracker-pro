import { describe, it, expect } from "vitest";
import {
  createRateLimiter,
  formatWait,
  redactRecord,
  redactSensitive,
  safeErrorMessage,
} from "./security";

describe("redactSensitive", () => {
  it("removes tokens, keys and bearer values", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.abc1234567890";
    expect(redactSensitive(`token=${jwt}`)).not.toContain("eyJhbGciOiJIUzI1NiIs");
    expect(redactSensitive("key sbp_abcdefghijklmnop")).toContain("[redacted key]");
    expect(redactSensitive("Authorization: Bearer abcdefgh12345678")).toContain(
      "Bearer [redacted]",
    );
  });

  it("hides the person but keeps the domain in an email", () => {
    expect(redactSensitive("failed for kaza@sktapri.app")).toBe(
      "failed for ***@sktapri.app",
    );
  });

  it("redacts phone numbers and long opaque strings", () => {
    expect(redactSensitive("call 9876543210")).toContain("[redacted phone]");
    expect(
      redactSensitive("sid=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"),
    ).toContain("[redacted]");
  });

  it("handles errors and objects without leaking their fields", () => {
    expect(redactSensitive(new Error("boom for kaza@sktapri.app"))).toBe(
      "Error: boom for ***@sktapri.app",
    );
    expect(redactSensitive({ note: "cash short" })).toContain("cash short");
  });
});

describe("redactRecord", () => {
  it("blanks sensitive keys and redacts the rest", () => {
    expect(
      redactRecord({
        code: "42501",
        token: "eyJhbGciOiJIUzI1NiJ9.zzzzzzzzzzzz",
        email: "kaza@sktapri.app",
        detail: "row not found",
      }),
    ).toEqual({
      code: "42501",
      token: "[redacted]",
      email: "[redacted]",
      detail: "row not found",
    });
  });
});

describe("safeErrorMessage", () => {
  it("returns a bounded, redacted message and a fallback", () => {
    expect(safeErrorMessage(new Error("Permission denied for kaza@sktapri.app"))).toBe(
      "Permission denied for ***@sktapri.app",
    );
    expect(safeErrorMessage(new Error(""))).toBe("Something went wrong.");
    expect(safeErrorMessage("missing ".repeat(60))).toHaveLength(300);
  });
});

describe("createRateLimiter", () => {
  it("allows up to the limit inside the window, then refuses", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 100).allowed).toBe(true);
    const third = limiter.check("a", 200);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);

    const refused = limiter.check("a", 300);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterMs).toBe(700);
  });

  it("counts each key separately and reopens after the window", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 10).allowed).toBe(false);
    expect(limiter.check("a", 1000).allowed).toBe(true);
  });

  it("can be reset for one key or all of them", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.check("a", 0);
    limiter.reset("a");
    expect(limiter.check("a", 0).allowed).toBe(true);
    limiter.check("b", 0);
    limiter.reset();
    expect(limiter.check("b", 0).allowed).toBe(true);
  });
});

describe("formatWait", () => {
  it("reports seconds and minutes", () => {
    expect(formatWait(4000)).toBe("4s");
    expect(formatWait(90_000)).toBe("2m");
  });
});
