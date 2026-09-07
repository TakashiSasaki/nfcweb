/**
 * Unified IndexedDB Database Management for nfcweb (`nfcweb_db`).
 * Authoritative single-database storage for NFC tag registry and photo assets.
 */

export const UNIFIED_DB_NAME = 'nfcweb_db';
export const UNIFIED_DB_VERSION = 1;

export const STORE_TAGS = 'tags';
export const STORE_PHOTO_ASSETS = 'photo_assets';

// Aliases for convenience
export const DB_NAME = UNIFIED_DB_NAME;
export const DB_VERSION = UNIFIED_DB_VERSION;
export const TAGS_STORE_NAME = STORE_TAGS;
export const PHOTOS_STORE_NAME = STORE_PHOTO_ASSETS;

export const getNfcDb = getUnifiedDB;
export const closeNfcDb = closeUnifiedDB;
export const resetNfcDbForTesting = _resetUnifiedDBForTesting;

let dbPromise: Promise<IDBDatabase> | null = null;

export function getIndexedDB(): IDBFactory | undefined {
  if (typeof indexedDB !== 'undefined') return indexedDB;
  if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
  if (typeof globalThis !== 'undefined' && (globalThis as any).indexedDB) return (globalThis as any).indexedDB;
  return undefined;
}

/**
 * Opens or retrieves the singleton connection to the unified `nfcweb_db` database.
 * Sets up object stores: `tags` (keyPath: 'uid') and `photo_assets` (keyPath: 'id').
 */
export function getUnifiedDB(): Promise<IDBDatabase> {
  const idb = getIndexedDB();
  if (!idb) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = idb.open(UNIFIED_DB_NAME, UNIFIED_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Tags Store
      if (!db.objectStoreNames.contains(STORE_TAGS)) {
        const tagStore = db.createObjectStore(STORE_TAGS, { keyPath: 'uid' });
        tagStore.createIndex('lastRead', 'lastRead', { unique: false });
      }

      // 2. Photo Assets Store
      if (!db.objectStoreNames.contains(STORE_PHOTO_ASSETS)) {
        db.createObjectStore(STORE_PHOTO_ASSETS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        try { db.close(); } catch (_) {}
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open unified nfcweb_db IndexedDB database'));
    };

    request.onblocked = () => {
      console.warn('Unified IndexedDB database open was blocked by an older connection');
    };
  });

  return dbPromise;
}

/**
 * Closes and resets the cached DB connection (used primarily during test teardown).
 */
export async function closeUnifiedDB(): Promise<void> {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      db.close();
    } catch (_) {}
    dbPromise = null;
  }
}

/**
 * For testing environment teardown: closes cached connection and clears memory state.
 */
export async function _resetUnifiedDBForTesting(): Promise<void> {
  await closeUnifiedDB();
  const idb = getIndexedDB();
  if (idb && typeof idb.deleteDatabase === 'function') {
    await new Promise<void>((resolve) => {
      const req = idb.deleteDatabase(UNIFIED_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }
}
