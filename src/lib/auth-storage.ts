/**
 * Where supabase-js keeps the session.
 *
 * Default behaviour is localStorage, which means the access and refresh tokens
 * survive in a place any script on the origin (and anyone with local access to
 * the machine) can read. Here the session goes to `sessionStorage` instead:
 * cleared when the tab closes, never shared between tabs, and never mixed in
 * with the app's own localStorage keys. The access token is additionally held
 * in memory only, so a refresh token is the most that a page can read back.
 *
 * `purgeLegacyAuthStorage()` deletes sessions written by the previous version
 * of the app from localStorage, so upgrading removes the old copies too.
 */
type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** supabase-js writes `sb-<ref>-auth-token` (and chunks of it). */
const AUTH_KEY_PATTERN = /^sb-.*-auth-token(\.\d+)?$/;

const memory = new Map<string, string>();

function sessionStore(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    // Touch the store so a blocked (private mode) sessionStorage is detected.
    const probe = "__sktapri_probe__";
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const authStorage: StorageLike = {
  getItem(key) {
    const store = sessionStore();
    if (store) {
      try {
        const value = store.getItem(key);
        if (value !== null) return value;
      } catch {
        // fall through to memory
      }
    }
    return memory.get(key) ?? null;
  },
  setItem(key, value) {
    memory.set(key, value);
    const store = sessionStore();
    if (store) {
      try {
        store.setItem(key, value);
      } catch {
        // Storage full or blocked: the in-memory copy still keeps this tab open.
      }
    }
  },
  removeItem(key) {
    memory.delete(key);
    const store = sessionStore();
    if (store) {
      try {
        store.removeItem(key);
      } catch {
        // Nothing to do — the key is gone from memory already.
      }
    }
  },
};

/** Drops sessions the app used to keep in localStorage (pre-hardening builds). */
export function purgeLegacyAuthStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && AUTH_KEY_PATTERN.test(key)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // localStorage can be unavailable; there is then nothing to purge.
  }
}

/** True when a stored auth key exists outside sessionStorage (should be false). */
export function hasAuthTokensInLocalStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (AUTH_KEY_PATTERN.test(key) || key.startsWith("sktapri.auth")) return true;
    }
  } catch {
    return false;
  }
  return false;
}
