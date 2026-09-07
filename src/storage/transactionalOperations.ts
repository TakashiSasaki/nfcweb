/**
 * Atomic multi-store IndexedDB operations spanning `tags` and `photo_assets` in `nfcweb_db`.
 */

import { NFCTagItem, PhotoUpdate } from '../types';
import { canonicalizeUid } from '../domain/uid';
import { getUnifiedDB, STORE_TAGS, STORE_PHOTO_ASSETS } from './database';
import { sanitizeTag } from './tagRepository';
import { generatePhotoAssetId } from './photoAssetRepository';

export interface StorageOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Atomically deletes a tag from `tags` and deletes its associated photo asset
 * from `photo_assets` within a single multi-store transaction.
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
        if (tag && tag.photoAssetId) {
          photosStore.delete(tag.photoAssetId);
        }
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

/**
 * Atomically clears all tags and all photo assets in `nfcweb_db` within a single transaction.
 */
export async function clearAllTagsTransactional(): Promise<void> {
  const db = await getUnifiedDB();
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_TAGS, STORE_PHOTO_ASSETS], 'readwrite');
      const tagsStore = tx.objectStore(STORE_TAGS);
      const photosStore = tx.objectStore(STORE_PHOTO_ASSETS);

      tagsStore.clear();
      photosStore.clear();

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction failed clearing tags and photos'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted clearing tags and photos'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Transactionally imports or replaces tags in `nfcweb_db`.
 * In 'replace' mode, it clears old tags, puts new tags, and cleans up any unreferenced photo assets.
 * In 'merge' mode, it merges incoming tags while preserving attached photo assets and URLs.
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
          const oldAssetIds = new Set<string>(
            oldTags.map(t => t.photoAssetId).filter((id): id is string => Boolean(id))
          );
          const newAssetIds = new Set<string>(
            sanitizedList.map(t => t.photoAssetId).filter((id): id is string => Boolean(id))
          );

          tagsStore.clear();
          for (const tag of sanitizedList) {
            tagsStore.put(tag);
          }

          // Delete photo assets that are no longer referenced by any remaining tag
          for (const oldId of oldAssetIds) {
            if (!newAssetIds.has(oldId)) {
              photosStore.delete(oldId);
            }
          }
        };

        getAllReq.onerror = () => {
          tx.abort();
        };
      } else {
        // Merge mode: read current tags and merge canonical properties while preserving existing local photos
        const getAllReq = tagsStore.getAll();
        getAllReq.onsuccess = () => {
          const currentTags = (getAllReq.result as NFCTagItem[]) || [];
          const currentMap = new Map<string, NFCTagItem>();
          for (const cur of currentTags) {
            currentMap.set(cur.uid, cur);
          }

          for (const incoming of sanitizedList) {
            const existing = currentMap.get(incoming.uid);
            let mergedTag: NFCTagItem;
            if (existing) {
              mergedTag = {
                ...incoming,
                photoAssetId: incoming.photoAssetId !== undefined ? incoming.photoAssetId : existing.photoAssetId,
                photoUrl: incoming.photoUrl !== undefined ? incoming.photoUrl : existing.photoUrl
              };
              if (mergedTag.photoAssetId === undefined) delete mergedTag.photoAssetId;
              if (mergedTag.photoUrl === undefined) delete mergedTag.photoUrl;
            } else {
              mergedTag = incoming;
            }
            tagsStore.put(mergedTag);
          }
        };

        getAllReq.onerror = () => {
          tx.abort();
        };
      }

      tx.oncomplete = () => {
        finishOnce({ success: true });
      };

      tx.onerror = () => {
        finishOnce({
          success: false,
          error: tx.error?.message || 'Transaction error during tag registry import'
        });
      };

      tx.onabort = () => {
        finishOnce({
          success: false,
          error: tx.error?.message || 'Transaction aborted during tag registry import'
        });
      };
    } catch (err: any) {
      resolve({
        success: false,
        error: err?.message || 'Failed to start import transaction'
      });
    }
  });
}

/**
 * Replaces the entire tag registry and cleans up unreferenced photo assets atomically.
 */
export async function replaceTagRegistryTransactional(
  tags: readonly NFCTagItem[]
): Promise<StorageOperationResult> {
  return importRegistryTransactional(tags, 'replace');
}

/**
 * Atomically updates a tag's photo metadata and manages photo assets in IndexedDB.
 * Supports adding, replacing, or clearing photos, or updating photoUrl in a single transaction.
 */
export async function updateTagPhotoTransactional(
  uid: string,
  update: PhotoUpdate
): Promise<{ success: boolean; error?: string; tag?: NFCTagItem }> {
  const canon = canonicalizeUid(uid);
  if (!canon) {
    return { success: false, error: 'Invalid tag UID' };
  }

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

        const effectiveAssetId: string | undefined =
          newAssetId !== undefined
            ? newAssetId
            : update.photoAssetId === undefined
              ? oldAssetId
              : update.photoAssetId === null
                ? undefined
                : update.photoAssetId;

        const effectivePhotoUrl: string | undefined =
          update.photoUrl === undefined
            ? currentTag.photoUrl
            : update.photoUrl === null
              ? undefined
              : update.photoUrl;

        updatedTag = {
          ...currentTag,
          uid: canon,
          photoAssetId: effectiveAssetId,
          photoUrl: effectivePhotoUrl
        };

        if (effectiveAssetId === undefined) {
          delete updatedTag.photoAssetId;
        }
        if (effectivePhotoUrl === undefined) {
          delete updatedTag.photoUrl;
        }

        // Clean up old photo asset if replaced or removed
        if (oldAssetId && oldAssetId !== effectiveAssetId) {
          photosStore.delete(oldAssetId);
        }

        tagsStore.put(updatedTag);
      };

      getReq.onerror = () => {
        tx.abort();
        finishOnce({ success: false, error: getReq.error?.message || 'Failed to read tag' });
      };

      tx.oncomplete = () => {
        finishOnce({ success: true, tag: updatedTag });
      };

      tx.onerror = () => {
        finishOnce({
          success: false,
          error: tx.error?.message || 'Transaction error updating tag photo'
        });
      };

      tx.onabort = () => {
        finishOnce({
          success: false,
          error: tx.error?.message || 'Transaction aborted updating tag photo'
        });
      };
    } catch (err: any) {
      resolve({
        success: false,
        error: err?.message || 'Failed to start photo update transaction'
      });
    }
  });
}
