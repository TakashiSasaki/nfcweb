/**
 * Safe, idempotent migration from legacy localStorage & old separate IndexedDB database
 * to the authoritative unified `nfcweb_db`.
 */

import { NFCTagItem } from '../types';
import { canonicalizeUid } from '../domain/uid';
import { getUnifiedDB, getIndexedDB, STORE_TAGS, STORE_PHOTO_ASSETS } from './database';
import { StoredPhotoAsset } from './photoAssetRepository';

export const LEGACY_TAGS_STORAGE_KEY = 'nfc_tags_registry';
export const LEGACY_PHOTO_DB_NAME = 'nfcweb_photo_assets_db';
export const MIGRATION_FLAG_KEY = 'nfc_unified_db_migrated_v1';
export const LEGACY_MIGRATION_FLAG_KEY = MIGRATION_FLAG_KEY;

export interface MigrationResult {
  migratedTags: number;
  migratedPhotos: number;
  alreadyMigrated: boolean;
}

/**
 * Performs a one-time safe, idempotent migration of legacy localStorage tags
 * and legacy IndexedDB photo assets into `nfcweb_db`.
 */
export async function performLegacyStorageMigration(): Promise<MigrationResult> {
  let migratedTags = 0;
  let migratedPhotos = 0;

  const idb = getIndexedDB();
  if (!idb) {
    return { migratedTags: 0, migratedPhotos: 0, alreadyMigrated: true };
  }

  const db = await getUnifiedDB();

  // -------------------------------------------------------------
  // 1. Tag Registry Migration (localStorage -> nfcweb_db [tags])
  // -------------------------------------------------------------
  try {
    let legacyRawTags: string | null = null;
    if (typeof localStorage !== 'undefined') {
      legacyRawTags = localStorage.getItem(LEGACY_TAGS_STORAGE_KEY);
    }

    if (legacyRawTags) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(legacyRawTags);
      } catch (err) {
        console.warn('Could not parse legacy localStorage tags for migration:', err);
      }

      if (Array.isArray(parsed) && parsed.length > 0) {
        // Check current tags store count
        const currentCount = await new Promise<number>((resolve) => {
          try {
            const tx = db.transaction(STORE_TAGS, 'readonly');
            const store = tx.objectStore(STORE_TAGS);
            const req = store.count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
          } catch (_) {
            resolve(0);
          }
        });

        // Only migrate if tags store in IndexedDB is empty
        if (currentCount === 0) {
          const tagsToMigrate: NFCTagItem[] = parsed
            .map((t: any) => ({
              ...t,
              uid: canonicalizeUid(t.uid)
            }))
            .filter((t: NFCTagItem) => Boolean(t.uid));

          if (tagsToMigrate.length > 0) {
            await new Promise<void>((resolve, reject) => {
              try {
                const tx = db.transaction(STORE_TAGS, 'readwrite');
                const store = tx.objectStore(STORE_TAGS);
                for (const tag of tagsToMigrate) {
                  store.put(tag);
                }
                tx.oncomplete = () => {
                  migratedTags = tagsToMigrate.length;
                  resolve();
                };
                tx.onerror = () => reject(tx.error || new Error('Migration transaction failed'));
              } catch (err) {
                reject(err);
              }
            });
          }
        }
      }

      // Once successfully copied or if legacy exists, clean up localStorage tag registry
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LEGACY_TAGS_STORAGE_KEY);
        localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
      }
    }
  } catch (err) {
    console.error('Error during legacy tag registry migration:', err);
  }

  // -------------------------------------------------------------
  // 2. Photo Assets Migration (nfcweb_photo_assets_db -> nfcweb_db)
  // -------------------------------------------------------------
  try {
    const legacyPhotos = await loadLegacyPhotosIfPresent(idb);
    if (legacyPhotos.length > 0) {
      await new Promise<void>((resolve, reject) => {
        try {
          const tx = db.transaction(STORE_PHOTO_ASSETS, 'readwrite');
          const store = tx.objectStore(STORE_PHOTO_ASSETS);
          for (const photo of legacyPhotos) {
            store.put(photo);
          }
          tx.oncomplete = () => {
            migratedPhotos = legacyPhotos.length;
            resolve();
          };
          tx.onerror = () => reject(tx.error || new Error('Photo migration transaction failed'));
        } catch (err) {
          reject(err);
        }
      });

      // Cleanup legacy photo database after copy
      try {
        idb.deleteDatabase(LEGACY_PHOTO_DB_NAME);
      } catch (_) {}
    }
  } catch (err) {
    console.error('Error during legacy photo asset migration:', err);
  }

  return {
    migratedTags,
    migratedPhotos,
    alreadyMigrated: migratedTags === 0 && migratedPhotos === 0
  };
}

async function loadLegacyPhotosIfPresent(idb: IDBFactory): Promise<StoredPhotoAsset[]> {
  return new Promise<StoredPhotoAsset[]>((resolve) => {
    try {
      // Attempt to open legacy DB with existing version
      const req = idb.open(LEGACY_PHOTO_DB_NAME);
      let wasUpgraded = false;

      req.onupgradeneeded = () => {
        // If DB did not exist previously, onupgradeneeded fires.
        wasUpgraded = true;
      };

      req.onsuccess = () => {
        const legacyDb = req.result;
        if (wasUpgraded || !legacyDb.objectStoreNames.contains('photo_assets')) {
          legacyDb.close();
          idb.deleteDatabase(LEGACY_PHOTO_DB_NAME);
          resolve([]);
          return;
        }

        try {
          const tx = legacyDb.transaction('photo_assets', 'readonly');
          const store = tx.objectStore('photo_assets');
          const getAllReq = store.getAll();

          getAllReq.onsuccess = () => {
            const list = (getAllReq.result as StoredPhotoAsset[]) || [];
            legacyDb.close();
            resolve(list);
          };

          getAllReq.onerror = () => {
            legacyDb.close();
            resolve([]);
          };
        } catch (_) {
          legacyDb.close();
          resolve([]);
        }
      };

      req.onerror = () => {
        resolve([]);
      };
    } catch (_) {
      resolve([]);
    }
  });
}
