import { describe, it, expect } from "vitest";
import {
  OAUTH_CALLBACK_PATH,
  buildOAuthRedirect,
  primaryProvider,
  providerVerifiedEmail,
  readOAuthCallback,
} from "./oauth";

describe("buildOAuthRedirect", () => {
  it("targets this origin's callback route", () => {
    expect(buildOAuthRedirect("https://app.example.com", null)).toBe(
      `https://app.example.com${OAUTH_CALLBACK_PATH}`,
    );
    expect(buildOAuthRedirect("http://localhost:5173", undefined)).toBe(
      `http://localhost:5173${OAUTH_CALLBACK_PATH}`,
    );
  });

  it("carries an internal return path, encoded", () => {
    expect(buildOAuthRedirect("https://app.example.com", "/admin?days=7")).toBe(
      `https://app.example.com${OAUTH_CALLBACK_PATH}?returnTo=%2Fadmin%3Fdays%3D7`,
    );
  });

  it("drops an untrusted or looping return path but keeps the callback", () => {
    for (const target of [
      "https://evil.example",
      "//evil.example",
      "javascript:alert(1)",
      "/auth/callback",
      "/auth/callback?code=abc",
      null,
    ]) {
      expect(buildOAuthRedirect("https://app.example.com", target)).toBe(
        `https://app.example.com${OAUTH_CALLBACK_PATH}`,
      );
    }
  });

  it("refuses an origin that is not https (or localhost)", () => {
    expect(buildOAuthRedirect("http://app.example.com", "/dashboard")).toBeNull();
    expect(buildOAuthRedirect("javascript:alert(1)", "/dashboard")).toBeNull();
    expect(buildOAuthRedirect("not a url", "/dashboard")).toBeNull();
  });
});

describe("readOAuthCallback", () => {
  it("reads the one-time PKCE code", () => {
    expect(readOAuthCallback("?code=abc123def456")).toEqual({
      code: "abc123def456",
      error: null,
      returnTo: null,
    });
  });

  it("never reads a token out of the address bar", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secretpayload.sig";
    const parsed = readOAuthCallback(
      `?access_token=${jwt}&refresh_token=abcdef123456&provider_token=xyz&code_verifier=verifier123`,
    );
    expect(parsed.code).toBeNull();
    expect(parsed.error).toBeNull();
    // Only these three fields exist, and none of them can hold a token.
    expect(Object.keys(parsed).sort()).toEqual(["code", "error", "returnTo"]);
    expect(JSON.stringify(parsed)).not.toContain("eyJhbGciOiJIUzI1NiIs");
  });

  it("rejects malformed and oversized codes", () => {
    expect(readOAuthCallback("?code=short").code).toBeNull();
    expect(readOAuthCallback(`?code=${"a".repeat(600)}`).code).toBeNull();
    expect(readOAuthCallback("?code=has%20space").code).toBeNull();
    expect(readOAuthCallback("").code).toBeNull();
  });

  it("surfaces a provider error, cleaned up and bounded", () => {
    expect(readOAuthCallback("?error=access_denied").error).toBe("access_denied");
    expect(
      readOAuthCallback("?error=server_error&error_description=User%20denied%20access")
        .error,
    ).toBe("User denied access");
    const noisy = readOAuthCallback(`?error_description=${"x".repeat(400)}`);
    expect(noisy.error).toHaveLength(200);
  });

  it("accepts only an internal return path", () => {
    expect(readOAuthCallback("?code=abc123def&returnTo=%2Fadmin").returnTo).toBe(
      "/admin",
    );
    expect(
      readOAuthCallback("?code=abc123def&returnTo=https%3A%2F%2Fevil.example").returnTo,
    ).toBeNull();
    expect(readOAuthCallback("?code=abc123def&returnTo=%2F%2Fevil.example").returnTo).toBeNull();
  });
});

describe("providerVerifiedEmail", () => {
  it("accepts a confirmed email", () => {
    expect(providerVerifiedEmail({ email_confirmed_at: "2026-10-13T09:00:00Z" })).toBe(
      true,
    );
    expect(providerVerifiedEmail({ confirmed_at: "2026-10-13T09:00:00Z" })).toBe(true);
  });

  it("accepts an OAuth provider, which verifies the address itself", () => {
    expect(providerVerifiedEmail({ app_metadata: { provider: "google" } })).toBe(true);
    expect(
      providerVerifiedEmail({ app_metadata: { provider: "email", providers: ["email", "google"] } }),
    ).toBe(true);
  });

  it("refuses an unconfirmed password account", () => {
    expect(providerVerifiedEmail({})).toBe(false);
    expect(providerVerifiedEmail({ app_metadata: { provider: "email" } })).toBe(false);
    expect(providerVerifiedEmail({ app_metadata: null })).toBe(false);
  });
});

describe("primaryProvider", () => {
  it("reports the provider Supabase recorded, defaulting to email", () => {
    expect(primaryProvider({ app_metadata: { provider: "google" } })).toBe("google");
    expect(primaryProvider({ app_metadata: { provider: "email" } })).toBe("email");
    expect(primaryProvider({ app_metadata: {} })).toBe("email");
    expect(primaryProvider({})).toBe("email");
  });
});
