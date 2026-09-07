// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  resetNfcDbForTesting, 
  getUnifiedDB, 
  STORE_TAGS, 
  STORE_PHOTO_ASSETS 
} from './database';
import { 
  saveTag, 
  saveAllTags, 
  deleteTag, 
  deleteTags, 
  clearAllTags, 
  replaceTagRegistry,
  getTagByUid,
  getAllTags,
  countTags
} from './tagRepository';
import { 
  savePhotoAsset, 
  getPhotoAsset, 
  deletePhotoAsset, 
  deletePhotoAssets 
} from './photoAssetRepository';
import { 
  updateTagPhotoTransactional, 
  deleteTagTransactional, 
  importRegistryTransactional,
  replaceTagRegistryTransactional
} from './transactionalOperations';
import { performLegacyStorageMigration, LEGACY_TAGS_STORAGE_KEY, LEGACY_MIGRATION_FLAG_KEY } from './legacyTagRegistryMigration';
import { enqueueTagMutation } from './tagMutationQueue';
import { NFCTagItem } from '../types';

describe('Transaction Durability & Failure Boundaries (nfcweb_db)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetNfcDbForTesting();
    vi.restoreAllMocks();
  });

  describe('Tag Repository transaction boundaries', () => {
    it('saveTag rejects and persists nothing if transaction aborts', async () => {
      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          if (storeName === STORE_TAGS) {
            vi.spyOn(store, 'put').mockImplementation((val: any) => {
              const req = origStore(storeName).put(val);
              tx.abort();
              return req;
            });
          }
          return store;
        });
        return tx;
      });

      const tag: NFCTagItem = {
        uid: '04112233445566',
        name: 'Aborted Tag',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: []
      };

      await expect(saveTag(tag)).rejects.toThrow();

      vi.restoreAllMocks();
      expect(await getTagByUid('04112233445566')).toBeNull();
      expect(await countTags()).toBe(0);
    });

    it('saveAllTags atomically rejects all writes if transaction aborts on any tag', async () => {
      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          let count = 0;
          vi.spyOn(store, 'put').mockImplementation((val: any) => {
            count++;
            if (count > 1) {
              tx.abort();
            }
            return origStore(storeName).put(val);
          });
          return store;
        });
        return tx;
      });

      const tags: NFCTagItem[] = [
        { uid: '04111111111111', name: 'T1', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] },
        { uid: '04222222222222', name: 'T2', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] }
      ];

      await expect(saveAllTags(tags)).rejects.toThrow();

      vi.restoreAllMocks();
      expect(await countTags()).toBe(0);
      expect(await getTagByUid('04111111111111')).toBeNull();
      expect(await getTagByUid('04222222222222')).toBeNull();
    });

    it('deleteTag rejects if transaction aborts, preserving the tag', async () => {
      const tag: NFCTagItem = {
        uid: '04112233445566',
        name: 'Preserved Tag',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: []
      };
      await saveTag(tag);
      expect(await getTagByUid('04112233445566')).not.toBeNull();

      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          vi.spyOn(store, 'delete').mockImplementation((key: any) => {
            const req = origStore(storeName).delete(key);
            tx.abort();
            return req;
          });
          return store;
        });
        return tx;
      });

      await expect(deleteTag('04112233445566')).rejects.toThrow();

      vi.restoreAllMocks();
      expect(await getTagByUid('04112233445566')).not.toBeNull();
    });

    it('deleteTags rejects and preserves all tags if transaction aborts', async () => {
      await saveAllTags([
        { uid: '04111111111111', name: 'T1', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] },
        { uid: '04222222222222', name: 'T2', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] }
      ]);

      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          vi.spyOn(store, 'delete').mockImplementation((key: any) => {
            const req = origStore(storeName).delete(key);
            tx.abort();
            return req;
          });
          return store;
        });
        return tx;
      });

      await expect(deleteTags(['04111111111111', '04222222222222'])).rejects.toThrow();

      vi.restoreAllMocks();
      expect(await countTags()).toBe(2);
    });

    it('clearAllTags rejects and retains data if transaction aborts', async () => {
      await saveTag({
        uid: '04111111111111',
        name: 'Must Retain',
        firstSeen: 1,
        lastRead: 1,
        readCount: 1,
        hasNdef: false,
        records: []
      });

      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          vi.spyOn(store, 'clear').mockImplementation(() => {
            const req = origStore(storeName).clear();
            tx.abort();
            return req;
          });
          return store;
        });
        return tx;
      });

      await expect(clearAllTags()).rejects.toThrow();

      vi.restoreAllMocks();
      expect(await countTags()).toBe(1);
    });

    it('replaceTagRegistry rejects and preserves old registry if transaction aborts', async () => {
      await saveTag({
        uid: '04111111111111',
        name: 'Original Tag',
        firstSeen: 1,
        lastRead: 1,
        readCount: 1,
        hasNdef: false,
        records: []
      });

      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          vi.spyOn(store, 'clear').mockImplementation(() => {
            tx.abort();
            return origStore(storeName).clear();
          });
          return store;
        });
        return tx;
      });

      await expect(replaceTagRegistry([
        { uid: '04999999999999', name: 'New Tag', firstSeen: 2, lastRead: 2, readCount: 1, hasNdef: false, records: [] }
      ])).rejects.toThrow();

      vi.restoreAllMocks();
      const all = await getAllTags();
      expect(all.length).toBe(1);
      expect(all[0].uid).toBe('04111111111111');
    });
  });

  describe('Photo Asset Repository transaction boundaries', () => {
    it('savePhotoAsset rejects and stores nothing if transaction aborts', async () => {
      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          if (storeName === STORE_PHOTO_ASSETS) {
            vi.spyOn(store, 'put').mockImplementation((val: any) => {
              const req = origStore(storeName).put(val);
              tx.abort();
              return req;
            });
          }
          return store;
        });
        return tx;
      });

      await expect(savePhotoAsset(new Blob(['test']), { id: 'photo-abort', mimeType: 'image/png' })).rejects.toThrow();

      vi.restoreAllMocks();
      expect(await getPhotoAsset('photo-abort')).toBeNull();
    });

    it('deletePhotoAsset rejects and preserves asset if transaction aborts', async () => {
      await savePhotoAsset(new Blob(['test']), { id: 'photo-stay', mimeType: 'image/png' });
      expect(await getPhotoAsset('photo-stay')).not.toBeNull();

      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          if (storeName === STORE_PHOTO_ASSETS) {
            vi.spyOn(store, 'delete').mockImplementation((key: any) => {
              const req = origStore(storeName).delete(key);
              tx.abort();
              return req;
            });
          }
          return store;
        });
        return tx;
      });

      await expect(deletePhotoAsset('photo-stay')).rejects.toThrow();

      vi.restoreAllMocks();
      expect(await getPhotoAsset('photo-stay')).not.toBeNull();
    });

    it('deletePhotoAssets rejects and preserves all assets if transaction aborts', async () => {
      await savePhotoAsset(new Blob(['1']), { id: 'p1', mimeType: 'image/png' });
      await savePhotoAsset(new Blob(['2']), { id: 'p2', mimeType: 'image/png' });

      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          if (storeName === STORE_PHOTO_ASSETS) {
            vi.spyOn(store, 'delete').mockImplementation((key: any) => {
              const req = origStore(storeName).delete(key);
              tx.abort();
              return req;
            });
          }
          return store;
        });
        return tx;
      });

      await expect(deletePhotoAssets(['p1', 'p2'])).rejects.toThrow();

      vi.restoreAllMocks();
      expect(await getPhotoAsset('p1')).not.toBeNull();
      expect(await getPhotoAsset('p2')).not.toBeNull();
    });
  });

  describe('updateTagPhotoTransactional atomic newPhotoAsset support', () => {
    it('atomically stores newPhotoAsset blob and updates tag in a single transaction', async () => {
      const initialTag: NFCTagItem = {
        uid: '04112233445566',
        name: 'Tag with Direct Asset',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: []
      };
      await saveTag(initialTag);

      const res = await updateTagPhotoTransactional('04112233445566', {
        newPhotoAsset: {
          id: 'photo-direct-1',
          blob: new Blob(['binary-photo-content'], { type: 'image/webp' }),
          mimeType: 'image/webp'
        },
        photoUrl: null
      });

      expect(res.success).toBe(true);
      expect(res.tag?.photoAssetId).toBe('photo-direct-1');

      const savedAsset = await getPhotoAsset('photo-direct-1');
      expect(savedAsset).not.toBeNull();
      expect(savedAsset?.mimeType).toBe('image/webp');
      expect(savedAsset?.byteSize).toBe(20);
    });

    it('rolls back both tag update and photo asset if transaction aborts during direct asset save', async () => {
      const initialTag: NFCTagItem = {
        uid: '04112233445566',
        name: 'Tag with Rollback',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: []
      };
      await saveTag(initialTag);

      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          if (storeName === STORE_PHOTO_ASSETS) {
            vi.spyOn(store, 'put').mockImplementation((val: any) => {
              const req = origStore(storeName).put(val);
              tx.abort();
              return req;
            });
          }
          return store;
        });
        return tx;
      });

      const res = await updateTagPhotoTransactional('04112233445566', {
        newPhotoAsset: {
          id: 'photo-should-abort',
          blob: new Blob(['binary-photo-content'], { type: 'image/webp' }),
          mimeType: 'image/webp'
        }
      });

      expect(res.success).toBe(false);

      vi.restoreAllMocks();
      const tag = await getTagByUid('04112233445566');
      expect(tag?.photoAssetId).toBeUndefined();
      expect(await getPhotoAsset('photo-should-abort')).toBeNull();
    });
  });

  describe('Deterministic Merge Migration Safety', () => {
    it('preserves existing tags in destination DB and merges non-conflicting legacy tags', async () => {
      // 1. Destination already has a tag
      await saveTag({
        uid: '04111111111111',
        name: 'Existing App Tag',
        firstSeen: 1000,
        lastRead: 5000,
        readCount: 10,
        hasNdef: false,
        records: []
      });

      // 2. Legacy localStorage has the same tag (with older read) and an additional legacy tag
      const legacyTags: NFCTagItem[] = [
        {
          uid: '04:11:11:11:11:11:11',
          name: 'Legacy Tag (Old)',
          firstSeen: 500,
          lastRead: 2000,
          readCount: 3,
          hasNdef: false,
          records: []
        },
        {
          uid: '04:22:22:22:22:22:22',
          name: 'Legacy Tag 2 (New to DB)',
          firstSeen: 800,
          lastRead: 800,
          readCount: 1,
          hasNdef: false,
          records: []
        }
      ];
      localStorage.setItem(LEGACY_TAGS_STORAGE_KEY, JSON.stringify(legacyTags));

      const result = await performLegacyStorageMigration();
      expect(result.migratedTags).toBe(1);
      expect(result.alreadyMigrated).toBe(false);

      const allTags = await getAllTags();
      expect(allTags.length).toBe(2);

      // Existing tag preserves higher read count & latest lastRead
      const tag1 = await getTagByUid('04111111111111');
      expect(tag1?.readCount).toBe(10);
      expect(tag1?.lastRead).toBe(5000);

      // New legacy tag was imported
      const tag2 = await getTagByUid('04222222222222');
      expect(tag2?.name).toBe('Legacy Tag 2 (New to DB)');

      // Legacy key cleaned up only after successful migration
      expect(localStorage.getItem(LEGACY_TAGS_STORAGE_KEY)).toBeNull();
      expect(localStorage.getItem(LEGACY_MIGRATION_FLAG_KEY)).toBe('true');
    });

    it('does not erase legacy storage if migration transaction fails', async () => {
      const legacyTags: NFCTagItem[] = [
        {
          uid: '04:11:11:11:11:11:11',
          name: 'Legacy Tag',
          firstSeen: 500,
          lastRead: 500,
          readCount: 1,
          hasNdef: false,
          records: []
        }
      ];
      localStorage.setItem(LEGACY_TAGS_STORAGE_KEY, JSON.stringify(legacyTags));

      const db = await getUnifiedDB();
      const origTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = origTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          vi.spyOn(store, 'put').mockImplementation((val: any) => {
            const req = origStore(storeName).put(val);
            tx.abort();
            return req;
          });
          return store;
        });
        return tx;
      });

      const result = await performLegacyStorageMigration();
      expect(result.migratedTags).toBe(0);

      vi.restoreAllMocks();
      // Legacy storage MUST still exist because migration failed
      expect(localStorage.getItem(LEGACY_TAGS_STORAGE_KEY)).not.toBeNull();
      expect(localStorage.getItem(LEGACY_MIGRATION_FLAG_KEY)).toBeNull();
    });
  });

  describe('Tag Mutation Queue Serialization', () => {
    it('executes rapid sequential mutations for the same UID in strict order without race conditions', async () => {
      const uid = '04112233445566';
      const results: number[] = [];

      const p1 = enqueueTagMutation(uid, async () => {
        await new Promise((r) => setTimeout(r, 20));
        results.push(1);
        return 1;
      });

      const p2 = enqueueTagMutation(uid, async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(2);
        return 2;
      });

      const p3 = enqueueTagMutation(uid, async () => {
        results.push(3);
        return 3;
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(r1).toBe(1);
      expect(r2).toBe(2);
      expect(r3).toBe(3);
      expect(results).toEqual([1, 2, 3]);
    });

    it('handles independent UIDs concurrently without blocking each other', async () => {
      const uidA = '04aaaaaaaaaaaa';
      const uidB = '04bbbbbbbbbbbb';
      const executionOrder: string[] = [];

      const pA = enqueueTagMutation(uidA, async () => {
        await new Promise((r) => setTimeout(r, 30));
        executionOrder.push('A');
      });

      const pB = enqueueTagMutation(uidB, async () => {
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push('B');
      });

      await Promise.all([pA, pB]);

      // B finishes faster than A because they are different queues
      expect(executionOrder).toEqual(['B', 'A']);
    });
  });
});
