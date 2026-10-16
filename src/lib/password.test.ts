import { describe, it, expect } from "vitest";
import {
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD_LENGTH,
  PASSWORD_RULES,
  isStrongPassword,
  passwordIssues,
  passwordStrength,
} from "./password";

describe("passwordIssues", () => {
  it("passes a strong passphrase", () => {
    expect(isStrongPassword("Monsoon!Bangles47x")).toBe(true);
  });

  it("enforces the length floor", () => {
    const short = "Ab1!".repeat(2);
    expect(passwordIssues(short)).toContain(
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  });

  it("requires every character class", () => {
    expect(passwordIssues("alllowercaseletters1!")).toContain(
      "Add an uppercase letter.",
    );
    expect(passwordIssues("ALLUPPERCASELETTERS1!")).toContain(
      "Add a lowercase letter.",
    );
    expect(passwordIssues("NoNumbersHere!!xx")).toContain("Add a number.");
    expect(passwordIssues("NoSymbolsHere1234")).toContain("Add a symbol.");
  });

  it("rejects repeats, sequences and keyboard walks", () => {
    expect(passwordIssues("Aaa1!bcdefghij")).toContain(
      "Avoid repeated or sequential characters.",
    );
    expect(passwordIssues("Qwerty!Pass12")).toContain(
      "Avoid keyboard patterns like qwerty.",
    );
  });

  it("rejects common, product and personal passwords", () => {
    expect(passwordIssues("Password123!")).toContain(
      "That password is too common.",
    );
    expect(passwordIssues("sktapri!Store1")).toContain(
      "Do not use the product name or the word “password”.",
    );
    expect(
      passwordIssues("Kaza!Ledger92x", { email: "kaza@sktapri.app" }),
    ).toContain("Do not use your email address in the password.");
    expect(
      passwordIssues("Spillow!42xq", { displayName: "SK Spillow" }),
    ).toContain("Do not use your name in the password.");
  });

  it("refuses spaces and passwords past the bcrypt limit", () => {
    expect(passwordIssues("Two words here 1!")).toContain(
      "Spaces are not allowed.",
    );
    expect(passwordIssues(`${"Aa1!".repeat(20)}x`)).toContain(
      `Keep it under ${MAX_PASSWORD_BYTES} characters.`,
    );
  });
});

describe("passwordStrength", () => {
  it("scores from empty to strong", () => {
    expect(passwordStrength("").score).toBe(0);
    expect(passwordStrength("abc").score).toBeLessThan(2);
    expect(passwordStrength("Monsoon!Bangles47x").score).toBe(4);
    expect(passwordStrength("Monsoon!Bangles47x").label).toBe("Strong");
  });

  it("caps the score for a known-bad password", () => {
    expect(passwordStrength("Qwerty123456!").score).toBeLessThanOrEqual(1);
  });
});

describe("PASSWORD_RULES", () => {
  it("reports the same verdict the full policy does for a strong password", () => {
    expect(PASSWORD_RULES.every((rule) => rule.test("Monsoon!Bangles47x"))).toBe(true);
    expect(PASSWORD_RULES.some((rule) => rule.test("password"))).toBe(false);
  });
});
