import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";

const QUEUE_KEY = "ledgerly.offlineQueue.v1";
const STORES_KEY = "ledgerly.stores.v1";
const SETTINGS_KEY = "ledgerly.settings.v1";

export type PendingRecord = {
  /** "pending:{uuid}" — stable React key before the server assigns an _id */
  localId: string;
  storeId: Id<"stores">;
  date: string;
  totalSales: number;
  cash: number;
  online: number;
  financed: number;
  note?: string;
  /** ms epoch — used for "Saved offline HH:MM" hints */
  createdAt: number;
};

export type StoresSnapshot = {
  stores: Doc<"stores">[];
  savedAt: number;
};

export type SettingsSnapshot = {
  currency: string;
  savedAt: number;
};

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable */
  }
}

// ---------- Record queue ----------

export function readQueue(): PendingRecord[] {
  return readJSON<PendingRecord[]>(QUEUE_KEY) ?? [];
}

export function writeQueue(queue: PendingRecord[]) {
  writeJSON(QUEUE_KEY, queue);
}

/**
 * Add or update a queued record for store+date (one record per store per day,
 * mirroring the server's upsert). Returns the updated queue.
 */
export function upsertQueuedRecord(
  record: Omit<PendingRecord, "localId" | "createdAt">,
): PendingRecord[] {
  const queue = readQueue();
  const existing = queue.find(
    (q) => q.storeId === record.storeId && q.date === record.date,
  );
  if (existing) {
    existing.totalSales = record.totalSales;
    existing.cash = record.cash;
    existing.online = record.online;
    existing.financed = record.financed;
    existing.note = record.note;
  } else {
    queue.push({
      ...record,
      localId: `pending:${crypto.randomUUID()}`,
      createdAt: Date.now(),
    });
  }
  writeQueue(queue);
  return queue;
}

export function removeFromQueue(localId: string): PendingRecord[] {
  const queue = readQueue().filter((q) => q.localId !== localId);
  writeQueue(queue);
  return queue;
}

export type UpsertFn = (args: {
  storeId: Id<"stores">;
  date: string;
  totalSales: number;
  cash: number;
  online: number;
  financed: number;
  note?: string;
}) => Promise<unknown>;

/**
 * Push every queued record to Convex. On the first failure (e.g. still
 * offline, session expired) the remaining queue is kept and we stop.
 * Returns the number of records successfully pushed.
 */
export async function syncQueue(upsert: UpsertFn): Promise<number> {
  const queue = readQueue();
  if (queue.length === 0) return 0;

  const remaining: PendingRecord[] = [];
  let pushed = 0;

  for (const item of queue) {
    try {
      const { localId: _localId, createdAt: _createdAt, ...args } = item;
      await upsert(args);
      pushed++;
    } catch {
      remaining.push(item);
      break;
    }
  }

  writeQueue(remaining.concat(queue.slice(pushed + remaining.length)));
  return pushed;
}

// ---------- Stores / settings snapshots ----------

export function readStoresSnapshot(): StoresSnapshot | null {
  return readJSON<StoresSnapshot>(STORES_KEY);
}

export function writeStoresSnapshot(stores: Doc<"stores">[]) {
  if (stores.length === 0) return;
  writeJSON<StoresSnapshot>(STORES_KEY, { stores, savedAt: Date.now() });
}

export function readSettingsSnapshot(): SettingsSnapshot | null {
  return readJSON<SettingsSnapshot>(SETTINGS_KEY);
}

export function writeSettingsSnapshot(currency: string) {
  writeJSON<SettingsSnapshot>(SETTINGS_KEY, { currency, savedAt: Date.now() });
}

// ---------- Online status ----------

/**
 * True only when the browser reports connectivity AND the Convex websocket
 * (via auth state) is established — the "online" event can fire before the
 * socket reconnects, so both signals are required before syncing.
 */
export function useIsOnline() {
  const { isAuthenticated } = useConvexAuth();
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return browserOnline && isAuthenticated;
}
