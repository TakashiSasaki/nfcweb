/**
 * Async Tag Repository for durable NFC tag registry persistence in `nfcweb_db`.
 */

import { NFCTagItem } from '../types';
import { canonicalizeUid } from '../domain/uid';
import { getUnifiedDB, STORE_TAGS } from './database';

/**
 * Normalizes an NFCTagItem to guarantee canonical UID formatting.
 */
export function sanitizeTag(tag: NFCTagItem): NFCTagItem {
  return {
    ...tag,
    uid: canonicalizeUid(tag.uid)
  };
}

/**
 * Fetches all tags from the authoritative IndexedDB `tags` store.
 * Results are sorted with most recently read tags first (lastRead DESC).
 */
export async function getAllTags(): Promise<NFCTagItem[]> {
  const db = await getUnifiedDB();
  return new Promise<NFCTagItem[]>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readonly');
      const store = tx.objectStore(STORE_TAGS);
      const req = store.getAll();

      req.onsuccess = () => {
        const rawList = (req.result as NFCTagItem[]) || [];
        const sanitized = rawList
          .map(sanitizeTag)
          .sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
        resolve(sanitized);
      };

      req.onerror = () => {
        reject(req.error || new Error('Failed to load tags from IndexedDB'));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieves a single tag by its UID.
 */
export async function getTagByUid(uid: string): Promise<NFCTagItem | null> {
  const canon = canonicalizeUid(uid);
  if (!canon) return null;

  const db = await getUnifiedDB();
  return new Promise<NFCTagItem | null>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readonly');
      const store = tx.objectStore(STORE_TAGS);
      const req = store.get(canon);

      req.onsuccess = () => {
        const tag = req.result as NFCTagItem | undefined;
        resolve(tag ? sanitizeTag(tag) : null);
      };

      req.onerror = () => {
        reject(req.error || new Error(`Failed to load tag with UID ${uid}`));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Persists or updates a single tag in IndexedDB.
 */
export async function saveTag(tag: NFCTagItem): Promise<void> {
  const sanitized = sanitizeTag(tag);
  const db = await getUnifiedDB();

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readwrite');
      const store = tx.objectStore(STORE_TAGS);
      store.put(sanitized);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Transaction error while saving tag ${tag.uid}`));
      tx.onabort = () => reject(tx.error || new Error(`Transaction aborted while saving tag ${tag.uid}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Batch puts multiple tags into IndexedDB within a single transaction.
 */
export async function saveAllTags(tags: readonly NFCTagItem[]): Promise<void> {
  if (tags.length === 0) return;
  const sanitizedList = tags.map(sanitizeTag);
  const db = await getUnifiedDB();

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readwrite');
      const store = tx.objectStore(STORE_TAGS);

      for (const tag of sanitizedList) {
        store.put(tag);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction error while saving tags'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted while saving tags'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Deletes a tag from IndexedDB by its canonical UID.
 */
export async function deleteTag(uid: string): Promise<void> {
  const canon = canonicalizeUid(uid);
  if (!canon) return;

  const db = await getUnifiedDB();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readwrite');
      const store = tx.objectStore(STORE_TAGS);
      store.delete(canon);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Transaction error deleting tag ${uid}`));
      tx.onabort = () => reject(tx.error || new Error(`Transaction aborted deleting tag ${uid}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Batch deletes multiple tags by canonical UID.
 */
export async function deleteTags(uids: string[]): Promise<void> {
  const canonUids = uids.map(canonicalizeUid).filter(Boolean);
  if (canonUids.length === 0) return;

  const db = await getUnifiedDB();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readwrite');
      const store = tx.objectStore(STORE_TAGS);

      for (const uid of canonUids) {
        store.delete(uid);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction error batch deleting tags'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted batch deleting tags'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Clears all tags from the `tags` store in IndexedDB.
 */
export async function clearAllTags(): Promise<void> {
  const db = await getUnifiedDB();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readwrite');
      const store = tx.objectStore(STORE_TAGS);
      store.clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction error clearing tags in IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted clearing tags in IndexedDB'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Replaces the entire tag registry with a new set of tags in a single atomic transaction.
 */
export async function replaceTagRegistry(tags: readonly NFCTagItem[]): Promise<void> {
  const sanitizedList = tags.map(sanitizeTag);
  const db = await getUnifiedDB();

  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readwrite');
      const store = tx.objectStore(STORE_TAGS);

      store.clear();
      for (const tag of sanitizedList) {
        store.put(tag);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction error replacing tag registry'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted replacing tag registry'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Returns the total count of stored tags in IndexedDB.
 */
export async function countTags(): Promise<number> {
  const db = await getUnifiedDB();
  return new Promise<number>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readonly');
      const store = tx.objectStore(STORE_TAGS);
      const req = store.count();

      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error || new Error('Failed to count tags in IndexedDB'));
    } catch (err) {
      reject(err);
    }
  });
}
