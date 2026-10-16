import { afterEach, describe, it, expect } from "vitest";
import {
  authStorage,
  hasAuthTokensInLocalStorage,
  purgeLegacyAuthStorage,
} from "./auth-storage";

type FakeStorage = {
  length: number;
  key: (index: number) => string | null;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  entries: () => Record<string, string>;
};

function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    entries: () => Object.fromEntries(map),
  };
}

const WINDOW_KEY = globalThis as unknown as { window?: unknown };

function withWindow(storage: {
  localStorage: FakeStorage;
  sessionStorage: FakeStorage;
}): void {
  WINDOW_KEY.window = storage;
}

afterEach(() => {
  delete WINDOW_KEY.window;
  authStorage.removeItem("sb-test-auth-token");
});

describe("authStorage", () => {
  it("keeps the session out of localStorage", () => {
    const local = fakeStorage();
    const session = fakeStorage();
    withWindow({ localStorage: local, sessionStorage: session });

    authStorage.setItem("sb-test-auth-token", "{\"access_token\":\"secret\"}");

    expect(session.entries()).toEqual({
      "sb-test-auth-token": "{\"access_token\":\"secret\"}",
    });
    expect(local.entries()).toEqual({});
    expect(authStorage.getItem("sb-test-auth-token")).toBe(
      "{\"access_token\":\"secret\"}",
    );

    authStorage.removeItem("sb-test-auth-token");
    expect(session.entries()).toEqual({});
  });

  it("falls back to memory when the session store is blocked", () => {
    const blocked = {
      ...fakeStorage(),
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      getItem: () => {
        throw new Error("blocked");
      },
    } as FakeStorage;
    withWindow({ localStorage: fakeStorage(), sessionStorage: blocked });

    authStorage.setItem("sb-blocked-auth-token", "value");
    expect(authStorage.getItem("sb-blocked-auth-token")).toBe("value");
    authStorage.removeItem("sb-blocked-auth-token");
    expect(authStorage.getItem("sb-blocked-auth-token")).toBeNull();
  });

  it("works without a window at all (server render)", () => {
    expect(authStorage.getItem("sb-test-auth-token")).toBeNull();
    expect(() => authStorage.setItem("sb-test-auth-token", "value")).not.toThrow();
    expect(hasAuthTokensInLocalStorage()).toBe(false);
    expect(() => purgeLegacyAuthStorage()).not.toThrow();
  });
});

describe("legacy cleanup", () => {
  it("removes only the tokens an older build left in localStorage", () => {
    const local = fakeStorage({
      "sb-abcdefgh-auth-token": "{}",
      "sb-abcdefgh-auth-token.0": "{}",
      "sktapri.workspace.v1": "{\"reports\":[]}",
    });
    withWindow({ localStorage: local, sessionStorage: fakeStorage() });

    expect(hasAuthTokensInLocalStorage()).toBe(true);
    purgeLegacyAuthStorage();

    expect(local.entries()).toEqual({ "sktapri.workspace.v1": "{\"reports\":[]}" });
    expect(hasAuthTokensInLocalStorage()).toBe(false);
  });
});
