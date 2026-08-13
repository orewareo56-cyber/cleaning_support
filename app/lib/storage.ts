import type { AppData, MasterItem } from "./types";
import { isValidBackup, migrateBackup } from "./domain";

const DATABASE = "katazuke-no-ippo";
const STORE = "app-state";
const STATE_KEY = "current";
const FALLBACK_KEY = "katazuke-no-ippo-state-v1";
const FALLBACK_ACTIVE_KEY = "katazuke-no-ippo-storage-fallback";

const PLACE_NAMES = ["リビング", "キッチン", "寝室", "玄関", "洗面所", "浴室", "クローゼット", "机", "その他"];
const ACTIVITY_NAMES = ["捨てた", "元の場所に戻した", "分類した", "収納した", "拭いた・掃除した", "まとめた", "その他"];

function initialMasters(names: string[], prefix: string): MasterItem[] {
  const now = new Date().toISOString();
  return names.map((name, index) => ({
    id: `${prefix}-${index + 1}`,
    name,
    sortOrder: index,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  }));
}

export function createInitialData(): AppData {
  return {
    schemaVersion: 1,
    places: initialMasters(PLACE_NAMES, "place-default"),
    activities: initialMasters(ACTIVITY_NAMES, "activity-default"),
    records: [],
    stopwatchSessions: [],
    recoveryGrants: [],
    recoveryUses: [],
    badgeAwards: [],
    settings: {
      timezone: "Asia/Tokyo",
      onboardingComplete: true,
      lastBackupAt: null,
    },
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedDb(): Promise<AppData | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(STATE_KEY);
    request.onsuccess = () => resolve((request.result as AppData | undefined) ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

async function writeIndexedDb(data: AppData): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(data, STATE_KEY);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadData(): Promise<AppData> {
  // If a previous IndexedDB write failed, the localStorage copy is newer than
  // the database. Read it first until a later successful database write clears
  // the marker; otherwise a reload could silently resurrect stale data.
  try {
    if (localStorage.getItem(FALLBACK_ACTIVE_KEY) === "1") {
      const stored = localStorage.getItem(FALLBACK_KEY);
      const candidate: unknown = stored ? JSON.parse(stored) : null;
      const restored = migrateBackup(candidate);
      if (restored) {
        if (!isValidBackup(candidate)) void saveData(restored);
        return restored;
      }
      localStorage.removeItem(FALLBACK_ACTIVE_KEY);
    }
  } catch {
    // Continue with IndexedDB when localStorage is unavailable.
  }
  try {
    if ("indexedDB" in window) {
      const stored = await readIndexedDb();
      const restored = migrateBackup(stored);
      if (restored) {
        if (!isValidBackup(stored)) void saveData(restored);
        return restored;
      }
    }
  } catch {
    // Some privacy modes expose IndexedDB but reject access. Fall through.
  }
  try {
    const stored = localStorage.getItem(FALLBACK_KEY);
    if (stored) {
      const candidate: unknown = JSON.parse(stored);
      const restored = migrateBackup(candidate);
      if (restored) {
        if (!isValidBackup(candidate)) void saveData(restored);
        return restored;
      }
    }
  } catch {
    // A fresh state keeps the app usable if browser storage is unavailable.
  }
  return createInitialData();
}

let pendingWrite = Promise.resolve();

export function saveData(data: AppData): Promise<void> {
  const snapshot = structuredClone(data);
  // A quota/privacy error must not permanently poison the queue. Later saves
  // still get a chance after the caller has surfaced the previous failure.
  pendingWrite = pendingWrite.catch(() => undefined).then(async () => {
    try {
      if ("indexedDB" in window) {
        await writeIndexedDb(snapshot);
        try {
          localStorage.removeItem(FALLBACK_KEY);
          localStorage.removeItem(FALLBACK_ACTIVE_KEY);
        } catch {
          // IndexedDB is authoritative; localStorage cleanup is best effort.
        }
        return;
      }
    } catch {
      // Use the compatibility fallback below.
    }
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(snapshot));
    localStorage.setItem(FALLBACK_ACTIVE_KEY, "1");
  });
  return pendingWrite;
}

export async function clearStoredData(): Promise<void> {
  try {
    if ("indexedDB" in window) {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(DATABASE);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
    }
  } finally {
    localStorage.removeItem(FALLBACK_KEY);
    localStorage.removeItem(FALLBACK_ACTIVE_KEY);
  }
}
