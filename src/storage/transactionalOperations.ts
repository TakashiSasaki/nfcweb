/**
 * Atomic IndexedDB operations for the authoritative `nfcweb_db` stores.
 */

import { NFCTagItem, PhotoUpdate, EditableNDEFRecord } from '../types';
import { canonicalizeUid } from '../domain/uid';
import { getUnifiedDB, STORE_TAGS, STORE_PHOTO_ASSETS } from './database';
import { sanitizeTag } from './tagRepository';
import { generatePhotoAssetId } from './photoAssetRepository';

export interface StorageOperationResult {
  success: boolean;
  error?: string;
}

export interface TagUpsertMutation {
  uid: string;
  records?: EditableNDEFRecord[];
  hasNdef?: boolean;
  tagType?: string;
  action?: 'read' | 'write' | 'erase';
  name?: string;
  now?: number;
}

/**
 * Reads the durable tag value and writes the next value in the same transaction.
 * This is the authority for readCount increments and prevents lost updates during
 * rapid scans or other concurrent read-modify-write operations.
 */
export async function upsertTagTransactional(
  mutation: TagUpsertMutation
): Promise<NFCTagItem> {
  const canon = canonicalizeUid(mutation.uid);
  if (!canon) throw new Error('Invalid tag UID');

  const db = await getUnifiedDB();
  const now = mutation.now ?? Date.now();

  return new Promise<NFCTagItem>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readwrite');
      const store = tx.objectStore(STORE_TAGS);
      let updatedTag: NFCTagItem | undefined;
      let settled = false;

      const rejectOnce = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const req = store.get(canon);
      req.onsuccess = () => {
        const existing = req.result as NFCTagItem | undefined;
        const action = mutation.action ?? 'read';

        if (existing) {
          updatedTag = sanitizeTag({
            ...existing,
            uid: canon,
            lastRead: now,
            readCount: (existing.readCount || 0) + 1,
            lastAction: action,
            tagType: mutation.tagType ?? existing.tagType,
            hasNdef: mutation.hasNdef !== undefined ? mutation.hasNdef : existing.hasNdef,
            records: mutation.records !== undefined ? mutation.records : existing.records,
            name: mutation.name !== undefined ? mutation.name : existing.name
          });
        } else {
          updatedTag = sanitizeTag({
            uid: canon,
            name: mutation.name || '',
            firstSeen: now,
            lastRead: now,
            readCount: 1,
            lastAction: action,
            tagType: mutation.tagType,
            hasNdef: mutation.hasNdef ?? Boolean(mutation.records?.length),
            records: mutation.records || []
          });
        }

        store.put(updatedTag);
      };

      req.onerror = () => {
        tx.abort();
        rejectOnce(req.error || new Error(`Failed to read tag ${canon}`));
      };

      tx.oncomplete = () => {
        if (settled) return;
        if (!updatedTag) {
          rejectOnce(new Error(`Tag mutation for ${canon} completed without a result`));
          return;
        }
        settled = true;
        resolve(updatedTag);
      };
      tx.onerror = () => rejectOnce(tx.error || new Error(`Transaction failed updating tag ${canon}`));
      tx.onabort = () => rejectOnce(tx.error || new Error(`Transaction aborted updating tag ${canon}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Patches mutable metadata from the current durable value in one transaction.
 */
export async function patchTagTransactional(
  uid: string,
  patch: Partial<Pick<NFCTagItem, 'name' | 'notes'>>
): Promise<NFCTagItem> {
  const canon = canonicalizeUid(uid);
  if (!canon) throw new Error('Invalid tag UID');

  const db = await getUnifiedDB();
  return new Promise<NFCTagItem>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_TAGS, 'readwrite');
      const store = tx.objectStore(STORE_TAGS);
      let updatedTag: NFCTagItem | undefined;
      let settled = false;

      const rejectOnce = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const req = store.get(canon);
      req.onsuccess = () => {
        const current = req.result as NFCTagItem | undefined;
        if (!current) {
          tx.abort();
          rejectOnce(new Error(`Tag with UID [${uid}] not found`));
          return;
        }
        updatedTag = sanitizeTag({ ...current, ...patch, uid: canon });
        store.put(updatedTag);
      };
      req.onerror = () => {
        tx.abort();
        rejectOnce(req.error || new Error(`Failed to read tag ${canon}`));
      };

      tx.oncomplete = () => {
        if (settled) return;
        if (!updatedTag) {
          rejectOnce(new Error(`Tag patch for ${canon} completed without a result`));
          return;
        }
        settled = true;
        resolve(updatedTag);
      };
      tx.onerror = () => rejectOnce(tx.error || new Error(`Transaction failed patching tag ${canon}`));
      tx.onabort = () => rejectOnce(tx.error || new Error(`Transaction aborted patching tag ${canon}`));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Atomically deletes a tag and its referenced photo asset.
 */
export async function deleteTagTransactional(uid: string): Promise<void> {
  const canon = canonicalizeUid(uid);
  if (!canon) return;

  const db = await getUnifiedDB();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_TAGS, STORE_PHOTO_ASSETS], 'readwrite');
      const tagsStore = tx.objectStore(STORE_TAGS);
      const photosStore = tx.objectStore(STORE_PHOTO_ASSETS);

      const getReq = tagsStore.get(canon);
      getReq.onsuccess = () => {
        const tag = getReq.result as NFCTagItem | undefined;
        if (tag?.photoAssetId) photosStore.delete(tag.photoAssetId);
        tagsStore.delete(canon);
      };
      getReq.onerror = () => {
        tx.abort();
        reject(getReq.error || new Error(`Failed to retrieve tag ${canon} before deletion`));
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Transaction failed deleting tag ${uid}`));
      tx.onabort = () => reject(tx.error || new Error(`Transaction aborted deleting tag ${uid}`));
    } catch (err) {
      reject(err);
    }
  });
}

/** Atomically clears all tags and photo assets. */
export async function clearAllTagsTransactional(): Promise<void> {
  const db = await getUnifiedDB();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_TAGS, STORE_PHOTO_ASSETS], 'readwrite');
      tx.objectStore(STORE_TAGS).clear();
      tx.objectStore(STORE_PHOTO_ASSETS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction failed clearing tags and photos'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted clearing tags and photos'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Transactionally imports or replaces tags. Replace also deletes photo assets
 * that are no longer referenced. Merge preserves existing local photo fields.
 */
export async function importRegistryTransactional(
  tags: readonly NFCTagItem[],
  mode: 'replace' | 'merge' = 'replace'
): Promise<StorageOperationResult> {
  const sanitizedList = tags.map(sanitizeTag);
  const db = await getUnifiedDB();

  return new Promise<StorageOperationResult>((resolve) => {
    try {
      const tx = db.transaction([STORE_TAGS, STORE_PHOTO_ASSETS], 'readwrite');
      const tagsStore = tx.objectStore(STORE_TAGS);
      const photosStore = tx.objectStore(STORE_PHOTO_ASSETS);
      let hasResolved = false;
      const finishOnce = (res: StorageOperationResult) => {
        if (!hasResolved) {
          hasResolved = true;
          resolve(res);
        }
      };

      if (mode === 'replace') {
        const getAllReq = tagsStore.getAll();
        getAllReq.onsuccess = () => {
          const oldTags = (getAllReq.result as NFCTagItem[]) || [];
          const oldAssetIds = new Set<string>(oldTags.map(t => t.photoAssetId).filter((id): id is string => Boolean(id)));
          const newAssetIds = new Set<string>(sanitizedList.map(t => t.photoAssetId).filter((id): id is string => Boolean(id)));

          tagsStore.clear();
          for (const tag of sanitizedList) tagsStore.put(tag);
          for (const oldId of oldAssetIds) {
            if (!newAssetIds.has(oldId)) photosStore.delete(oldId);
          }
        };
        getAllReq.onerror = () => tx.abort();
      } else {
        const getAllReq = tagsStore.getAll();
        getAllReq.onsuccess = () => {
          const currentTags = (getAllReq.result as NFCTagItem[]) || [];
          const currentMap = new Map(currentTags.map(tag => [tag.uid, tag]));
          for (const incoming of sanitizedList) {
            const existing = currentMap.get(incoming.uid);
            const mergedTag: NFCTagItem = existing ? {
              ...incoming,
              photoAssetId: incoming.photoAssetId !== undefined ? incoming.photoAssetId : existing.photoAssetId,
              photoUrl: incoming.photoUrl !== undefined ? incoming.photoUrl : existing.photoUrl
            } : incoming;
            if (mergedTag.photoAssetId === undefined) delete mergedTag.photoAssetId;
            if (mergedTag.photoUrl === undefined) delete mergedTag.photoUrl;
            tagsStore.put(mergedTag);
          }
        };
        getAllReq.onerror = () => tx.abort();
      }

      tx.oncomplete = () => finishOnce({ success: true });
      tx.onerror = () => finishOnce({ success: false, error: tx.error?.message || 'Transaction error during tag registry import' });
      tx.onabort = () => finishOnce({ success: false, error: tx.error?.message || 'Transaction aborted during tag registry import' });
    } catch (err: any) {
      resolve({ success: false, error: err?.message || 'Failed to start import transaction' });
    }
  });
}

export async function replaceTagRegistryTransactional(
  tags: readonly NFCTagItem[]
): Promise<StorageOperationResult> {
  return importRegistryTransactional(tags, 'replace');
}

/**
 * Atomically adds/replaces/removes a tag photo. When `newPhotoAsset` is supplied,
 * the new blob, tag reference, and old-asset cleanup share one transaction.
 */
export async function updateTagPhotoTransactional(
  uid: string,
  update: PhotoUpdate
): Promise<{ success: boolean; error?: string; tag?: NFCTagItem }> {
  const canon = canonicalizeUid(uid);
  if (!canon) return { success: false, error: 'Invalid tag UID' };

  const db = await getUnifiedDB();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_TAGS, STORE_PHOTO_ASSETS], 'readwrite');
      const tagsStore = tx.objectStore(STORE_TAGS);
      const photosStore = tx.objectStore(STORE_PHOTO_ASSETS);
      let updatedTag: NFCTagItem | undefined;
      let hasResolved = false;
      const finishOnce = (res: { success: boolean; error?: string; tag?: NFCTagItem }) => {
        if (!hasResolved) {
          hasResolved = true;
          resolve(res);
        }
      };

      const getReq = tagsStore.get(canon);
      getReq.onsuccess = () => {
        const currentTag = getReq.result as NFCTagItem | undefined;
        if (!currentTag) {
          tx.abort();
          finishOnce({ success: false, error: `Tag with UID [${uid}] not found` });
          return;
        }

        const oldAssetId = currentTag.photoAssetId;
        let newAssetId: string | undefined;
        if (update.newPhotoAsset) {
          const asset = update.newPhotoAsset;
          newAssetId = asset.id || generatePhotoAssetId();
          const now = Date.now();
          photosStore.put({
            id: newAssetId,
            blob: asset.blob,
            mimeType: asset.mimeType || asset.blob.type || 'image/jpeg',
            byteSize: asset.blob.size,
            createdAt: now,
            updatedAt: now,
            width: asset.width,
            height: asset.height
          });
        }

        const effectiveAssetId = newAssetId !== undefined
          ? newAssetId
          : update.photoAssetId === undefined
            ? oldAssetId
            : update.photoAssetId === null ? undefined : update.photoAssetId;
        const effectivePhotoUrl = update.photoUrl === undefined
          ? currentTag.photoUrl
          : update.photoUrl === null ? undefined : update.photoUrl;

        updatedTag = { ...currentTag, uid: canon, photoAssetId: effectiveAssetId, photoUrl: effectivePhotoUrl };
        if (effectiveAssetId === undefined) delete updatedTag.photoAssetId;
        if (effectivePhotoUrl === undefined) delete updatedTag.photoUrl;

        if (oldAssetId && oldAssetId !== effectiveAssetId) photosStore.delete(oldAssetId);
        tagsStore.put(updatedTag);
      };
      getReq.onerror = () => {
        tx.abort();
        finishOnce({ success: false, error: getReq.error?.message || 'Failed to read tag' });
      };

      tx.oncomplete = () => finishOnce({ success: true, tag: updatedTag });
      tx.onerror = () => finishOnce({ success: false, error: tx.error?.message || 'Transaction error updating tag photo' });
      tx.onabort = () => finishOnce({ success: false, error: tx.error?.message || 'Transaction aborted updating tag photo' });
    } catch (err: any) {
      resolve({ success: false, error: err?.message || 'Failed to start photo update transaction' });
    }
  });
}
