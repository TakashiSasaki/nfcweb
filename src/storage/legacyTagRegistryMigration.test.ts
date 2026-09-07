// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  performLegacyStorageMigration, 
  LEGACY_TAGS_STORAGE_KEY, 
  LEGACY_PHOTO_DB_NAME,
  LEGACY_MIGRATION_FLAG_KEY
} from './legacyTagRegistryMigration';
import { resetNfcDbForTesting } from './database';
import { getAllTags } from './tagRepository';
import { getPhotoAsset, getPhotoAssetBlob } from './photoAssetRepository';
import { NFCTagItem } from '../types';

describe('Legacy Storage to Unified nfcweb_db Migration', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetNfcDbForTesting();
    // Also delete any existing legacy database in fake-indexeddb
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(LEGACY_PHOTO_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    vi.restoreAllMocks();
  });

  it('migrates legacy localStorage tags into unified IndexedDB database', async () => {
    const legacyTags: NFCTagItem[] = [
      {
        uid: '04:11:22:33:44:55:66',
        name: 'Legacy Tag 1',
        firstSeen: 1000,
        lastRead: 2000,
        readCount: 5,
        hasNdef: false,
        records: []
      }
    ];

    localStorage.setItem(LEGACY_TAGS_STORAGE_KEY, JSON.stringify(legacyTags));

    const result = await performLegacyStorageMigration();
    expect(result.migratedTags).toBe(1);
    expect(result.alreadyMigrated).toBe(false);

    const migratedTags = await getAllTags();
    expect(migratedTags.length).toBe(1);
    expect(migratedTags[0].uid).toBe('04112233445566');
    expect(migratedTags[0].name).toBe('Legacy Tag 1');

    // Migration flag set
    expect(localStorage.getItem(LEGACY_MIGRATION_FLAG_KEY)).toBe('true');
    // Legacy registry key cleaned up
    expect(localStorage.getItem(LEGACY_TAGS_STORAGE_KEY)).toBeNull();
  });

  it('migrates legacy photo assets from nfcweb_photo_assets_db into nfcweb_db', async () => {
    // 1. Create and populate legacy photo DB
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open(LEGACY_PHOTO_DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('photo_assets', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('photo_assets', 'readwrite');
        const store = tx.objectStore('photo_assets');
        store.put({
          id: 'photo-legacy-123',
          blob: new Blob(['legacy-photo-binary'], { type: 'image/jpeg' }),
          mimeType: 'image/jpeg',
          byteSize: 19,
          createdAt: 1000,
          updatedAt: 1000
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const result = await performLegacyStorageMigration();
    expect(result.migratedPhotos).toBe(1);

    const asset = await getPhotoAsset('photo-legacy-123');
    expect(asset).not.toBeNull();
    expect(asset?.id).toBe('photo-legacy-123');
    expect(asset?.mimeType).toBe('image/jpeg');

    const blob = await getPhotoAssetBlob('photo-legacy-123');
    expect(blob).not.toBeNull();
  });

  it('is idempotent: running migration repeatedly does not duplicate or corrupt items', async () => {
    const legacyTags: NFCTagItem[] = [
      {
        uid: '04:11:22:33:44:55:66',
        name: 'Legacy Tag 1',
        firstSeen: 1000,
        lastRead: 2000,
        readCount: 5,
        hasNdef: false,
        records: []
      }
    ];

    localStorage.setItem(LEGACY_TAGS_STORAGE_KEY, JSON.stringify(legacyTags));

    const result1 = await performLegacyStorageMigration();
    expect(result1.migratedTags).toBe(1);

    // Second run
    const result2 = await performLegacyStorageMigration();
    expect(result2.migratedTags).toBe(0);
    expect(result2.alreadyMigrated).toBe(true);

    const tags = await getAllTags();
    expect(tags.length).toBe(1);
  });
});
