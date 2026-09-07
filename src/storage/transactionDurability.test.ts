// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetNfcDbForTesting, getUnifiedDB, STORE_TAGS, STORE_PHOTO_ASSETS } from './database';
import {
  saveTag,
  saveAllTags,
  deleteTag,
  clearAllTags,
  replaceTagRegistry,
  getTagByUid,
  countTags
} from './tagRepository';
import { savePhotoAsset, getPhotoAsset, deletePhotoAsset } from './photoAssetRepository';
import {
  upsertTagTransactional,
  patchTagTransactional,
  updateTagPhotoTransactional
} from './transactionalOperations';
import { enqueueTagMutation } from './tagMutationQueue';
import { NFCTagItem } from '../types';

const makeTag = (uid: string, overrides: Partial<NFCTagItem> = {}): NFCTagItem => ({
  uid,
  name: 'Tag',
  firstSeen: 1,
  lastRead: 1,
  readCount: 1,
  hasNdef: false,
  records: [],
  ...overrides
});

describe('Final nfcweb_db durability and mutation invariants', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetNfcDbForTesting();
    vi.restoreAllMocks();
  });

  it('saveTag rejects and persists nothing when its transaction aborts', async () => {
    const db = await getUnifiedDB();
    const original = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
      const tx = original(stores, mode);
      const originalStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name: string) => {
        const store = originalStore(name);
        if (name === STORE_TAGS) {
          vi.spyOn(store, 'put').mockImplementation((value: any) => {
            const req = originalStore(name).put(value);
            tx.abort();
            return req;
          });
        }
        return store;
      });
      return tx;
    });

    await expect(saveTag(makeTag('04112233445566'))).rejects.toThrow();
    vi.restoreAllMocks();
    expect(await countTags()).toBe(0);
  });

  it('saveAllTags is atomic on abort', async () => {
    const db = await getUnifiedDB();
    const original = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
      const tx = original(stores, mode);
      const originalStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name: string) => {
        const store = originalStore(name);
        let puts = 0;
        vi.spyOn(store, 'put').mockImplementation((value: any) => {
          const req = originalStore(name).put(value);
          puts += 1;
          if (puts === 2) tx.abort();
          return req;
        });
        return store;
      });
      return tx;
    });

    await expect(saveAllTags([makeTag('04111111111111'), makeTag('04222222222222')])).rejects.toThrow();
    vi.restoreAllMocks();
    expect(await countTags()).toBe(0);
  });

  it('deleteTag preserves the tag when its transaction aborts', async () => {
    const uid = '04112233445566';
    await saveTag(makeTag(uid));
    const db = await getUnifiedDB();
    const original = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
      const tx = original(stores, mode);
      const originalStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name: string) => {
        const store = originalStore(name);
        vi.spyOn(store, 'delete').mockImplementation((key: any) => {
          const req = originalStore(name).delete(key);
          tx.abort();
          return req;
        });
        return store;
      });
      return tx;
    });

    await expect(deleteTag(uid)).rejects.toThrow();
    vi.restoreAllMocks();
    expect(await getTagByUid(uid)).not.toBeNull();
  });

  it('clearAllTags preserves data when its transaction aborts', async () => {
    await saveTag(makeTag('04111111111111'));
    const db = await getUnifiedDB();
    const original = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
      const tx = original(stores, mode);
      const originalStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name: string) => {
        const store = originalStore(name);
        vi.spyOn(store, 'clear').mockImplementation(() => {
          const req = originalStore(name).clear();
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

  it('replaceTagRegistry preserves the previous registry on abort', async () => {
    await saveTag(makeTag('04111111111111', { name: 'Original' }));
    const db = await getUnifiedDB();
    const original = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
      const tx = original(stores, mode);
      const originalStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name: string) => {
        const store = originalStore(name);
        vi.spyOn(store, 'clear').mockImplementation(() => {
          const req = originalStore(name).clear();
          tx.abort();
          return req;
        });
        return store;
      });
      return tx;
    });

    await expect(replaceTagRegistry([makeTag('04999999999999')])).rejects.toThrow();
    vi.restoreAllMocks();
    expect((await getTagByUid('04111111111111'))?.name).toBe('Original');
    expect(await getTagByUid('04999999999999')).toBeNull();
  });

  it('savePhotoAsset stores nothing when its transaction aborts', async () => {
    const db = await getUnifiedDB();
    const original = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
      const tx = original(stores, mode);
      const originalStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name: string) => {
        const store = originalStore(name);
        if (name === STORE_PHOTO_ASSETS) {
          vi.spyOn(store, 'put').mockImplementation((value: any) => {
            const req = originalStore(name).put(value);
            tx.abort();
            return req;
          });
        }
        return store;
      });
      return tx;
    });

    await expect(savePhotoAsset(new Blob(['photo']), { id: 'photo-abort', mimeType: 'image/png' })).rejects.toThrow();
    vi.restoreAllMocks();
    expect(await getPhotoAsset('photo-abort')).toBeNull();
  });

  it('deletePhotoAsset preserves the asset when its transaction aborts', async () => {
    await savePhotoAsset(new Blob(['photo']), { id: 'photo-stay', mimeType: 'image/png' });
    const db = await getUnifiedDB();
    const original = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
      const tx = original(stores, mode);
      const originalStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name: string) => {
        const store = originalStore(name);
        if (name === STORE_PHOTO_ASSETS) {
          vi.spyOn(store, 'delete').mockImplementation((key: any) => {
            const req = originalStore(name).delete(key);
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

  it('atomically adds a new photo blob and tag reference', async () => {
    const uid = '04112233445566';
    await saveTag(makeTag(uid));
    const result = await updateTagPhotoTransactional(uid, {
      newPhotoAsset: {
        id: 'photo-direct',
        blob: new Blob(['binary-photo'], { type: 'image/webp' }),
        mimeType: 'image/webp'
      },
      photoUrl: null
    });

    expect(result.success).toBe(true);
    expect(result.tag?.photoAssetId).toBe('photo-direct');
    expect((await getTagByUid(uid))?.photoAssetId).toBe('photo-direct');
    expect(await getPhotoAsset('photo-direct')).not.toBeNull();
  });

  it('rolls back both tag reference and new photo blob when atomic photo update aborts', async () => {
    const uid = '04112233445566';
    await saveTag(makeTag(uid));
    const db = await getUnifiedDB();
    const original = db.transaction.bind(db);
    vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
      const tx = original(stores, mode);
      const originalStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((name: string) => {
        const store = originalStore(name);
        if (name === STORE_PHOTO_ASSETS) {
          vi.spyOn(store, 'put').mockImplementation((value: any) => {
            const req = originalStore(name).put(value);
            tx.abort();
            return req;
          });
        }
        return store;
      });
      return tx;
    });

    const result = await updateTagPhotoTransactional(uid, {
      newPhotoAsset: { id: 'photo-abort', blob: new Blob(['photo']), mimeType: 'image/png' }
    });
    expect(result.success).toBe(false);
    vi.restoreAllMocks();
    expect((await getTagByUid(uid))?.photoAssetId).toBeUndefined();
    expect(await getPhotoAsset('photo-abort')).toBeNull();
  });

  it('patchTagTransactional derives metadata from the current durable tag', async () => {
    const uid = '04112233445566';
    await saveTag(makeTag(uid, { name: 'A', notes: 'old' }));
    const updated = await patchTagTransactional(uid, { name: 'B' });
    expect(updated.name).toBe('B');
    expect(updated.notes).toBe('old');
    expect((await getTagByUid(uid))?.name).toBe('B');
  });

  it('rapid durable upserts do not lose readCount increments', async () => {
    const uid = '04112233445566';
    await upsertTagTransactional({ uid, action: 'read', now: 1 });
    await Promise.all([
      upsertTagTransactional({ uid, action: 'read', now: 2 }),
      upsertTagTransactional({ uid, action: 'read', now: 3 })
    ]);
    const durable = await getTagByUid(uid);
    expect(durable?.readCount).toBe(3);
  });

  it('serializes application mutations for the same UID in FIFO order', async () => {
    const results: number[] = [];
    const uid = '04112233445566';
    const first = enqueueTagMutation(uid, async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      results.push(1);
      return 1;
    });
    const second = enqueueTagMutation(uid, async () => {
      results.push(2);
      return 2;
    });
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(results).toEqual([1, 2]);
  });

  it('allows independent UID mutation queues to proceed concurrently', async () => {
    const order: string[] = [];
    await Promise.all([
      enqueueTagMutation('04aaaaaaaaaaaa', async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        order.push('A');
      }),
      enqueueTagMutation('04bbbbbbbbbbbb', async () => {
        order.push('B');
      })
    ]);
    expect(order).toEqual(['B', 'A']);
  });
});
