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
  deleteTagTransactional, 
  clearAllTagsTransactional, 
  importRegistryTransactional,
  replaceTagRegistryTransactional,
  updateTagPhotoTransactional
} from './transactionalOperations';
import { saveTag, getAllTags, getTagByUid } from './tagRepository';
import { savePhotoAsset, getPhotoAsset, getPhotoAssetBlob } from './photoAssetRepository';
import { NFCTagItem } from '../types';

describe('Atomic Multi-Store Transactional Operations (nfcweb_db)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetNfcDbForTesting();
    vi.restoreAllMocks();
  });

  describe('deleteTagTransactional', () => {
    it('atomically deletes a tag and its referenced photo asset', async () => {
      const tagUid = '04112233445566';
      const assetId = 'photo-asset-delete-test';

      await savePhotoAsset(new Blob(['test-photo-data'], { type: 'image/jpeg' }), {
        id: assetId,
        mimeType: 'image/jpeg'
      });

      const tag: NFCTagItem = {
        uid: tagUid,
        name: 'Tag with Photo',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: assetId
      };
      await saveTag(tag);

      expect(await getTagByUid(tagUid)).not.toBeNull();
      expect(await getPhotoAsset(assetId)).not.toBeNull();

      await deleteTagTransactional(tagUid);

      expect(await getTagByUid(tagUid)).toBeNull();
      expect(await getPhotoAsset(assetId)).toBeNull();
    });

    it('deletes tag with no photo asset gracefully without affecting other tags or assets', async () => {
      const tagUid1 = '04112233445566';
      const tagUid2 = '04998877665544';
      const assetId2 = 'photo-asset-remain';

      await savePhotoAsset(new Blob(['other-photo'], { type: 'image/jpeg' }), {
        id: assetId2,
        mimeType: 'image/jpeg'
      });

      await saveTag({
        uid: tagUid1,
        name: 'Tag without Photo',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: []
      });

      await saveTag({
        uid: tagUid2,
        name: 'Tag 2',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: assetId2
      });

      await deleteTagTransactional(tagUid1);

      expect(await getTagByUid(tagUid1)).toBeNull();
      expect(await getTagByUid(tagUid2)).not.toBeNull();
      expect(await getPhotoAsset(assetId2)).not.toBeNull();
    });

    it('rolls back completely if transaction fails during delete', async () => {
      const tagUid = '04112233445566';
      const assetId = 'photo-rollback-delete';

      await savePhotoAsset(new Blob(['rollback-photo']), {
        id: assetId,
        mimeType: 'image/png'
      });

      await saveTag({
        uid: tagUid,
        name: 'Tag Rollback',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: assetId
      });

      const db = await getUnifiedDB();
      const originalTx = db.transaction.bind(db);
      vi.spyOn(db, 'transaction').mockImplementation((stores: any, mode: any) => {
        const tx = originalTx(stores, mode);
        const origStore = tx.objectStore.bind(tx);
        vi.spyOn(tx, 'objectStore').mockImplementation((storeName: string) => {
          const store = origStore(storeName);
          if (storeName === STORE_PHOTO_ASSETS) {
            vi.spyOn(store, 'delete').mockImplementation(() => {
              tx.abort();
              throw new Error('Simulated photo delete error');
            });
          }
          return store;
        });
        return tx;
      });

      await expect(deleteTagTransactional(tagUid)).rejects.toThrow();

      // Reset mock to query database
      vi.restoreAllMocks();
      expect(await getTagByUid(tagUid)).not.toBeNull();
      expect(await getPhotoAsset(assetId)).not.toBeNull();
    });
  });

  describe('clearAllTagsTransactional', () => {
    it('atomically clears both tags and photo assets', async () => {
      await savePhotoAsset(new Blob(['p1']), { id: 'asset-1', mimeType: 'image/jpeg' });
      await savePhotoAsset(new Blob(['p2']), { id: 'asset-2', mimeType: 'image/png' });

      await saveTag({
        uid: '04111111111111',
        name: 'Tag 1',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: 'asset-1'
      });
      await saveTag({
        uid: '04222222222222',
        name: 'Tag 2',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: 'asset-2'
      });

      await clearAllTagsTransactional();

      const tags = await getAllTags();
      expect(tags.length).toBe(0);
      expect(await getPhotoAsset('asset-1')).toBeNull();
      expect(await getPhotoAsset('asset-2')).toBeNull();
    });
  });

  describe('importRegistryTransactional', () => {
    it('in replace mode, replaces tags and cleans unreferenced photo assets while preserving referenced ones', async () => {
      const assetKeep = 'photo-keep-123';
      const assetDrop = 'photo-drop-456';

      await savePhotoAsset(new Blob(['keep']), { id: assetKeep, mimeType: 'image/png' });
      await savePhotoAsset(new Blob(['drop']), { id: assetDrop, mimeType: 'image/png' });

      await saveTag({
        uid: '04111111111111',
        name: 'Old Tag 1',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: assetDrop
      });

      const newTags: NFCTagItem[] = [
        {
          uid: '04333333333333',
          name: 'New Tag With Kept Asset',
          firstSeen: 2000,
          lastRead: 2000,
          readCount: 1,
          hasNdef: false,
          records: [],
          photoAssetId: assetKeep
        }
      ];

      const res = await replaceTagRegistryTransactional(newTags);
      expect(res.success).toBe(true);

      const loadedTags = await getAllTags();
      expect(loadedTags.length).toBe(1);
      expect(loadedTags[0].uid).toBe('04333333333333');

      expect(await getPhotoAsset(assetKeep)).not.toBeNull();
      expect(await getPhotoAsset(assetDrop)).toBeNull();
    });

    it('in merge mode, upserts new tags without deleting existing tags or photo assets', async () => {
      const assetExisting = 'photo-exist-1';
      await savePhotoAsset(new Blob(['exist']), { id: assetExisting, mimeType: 'image/png' });

      await saveTag({
        uid: '04111111111111',
        name: 'Existing Tag',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: assetExisting
      });

      const incomingTags: NFCTagItem[] = [
        {
          uid: '04222222222222',
          name: 'Incoming Merged Tag',
          firstSeen: 2000,
          lastRead: 2000,
          readCount: 1,
          hasNdef: false,
          records: []
        }
      ];

      const res = await importRegistryTransactional(incomingTags, 'merge');
      expect(res.success).toBe(true);

      const all = await getAllTags();
      expect(all.length).toBe(2);
      expect(await getPhotoAsset(assetExisting)).not.toBeNull();
    });
  });

  describe('updateTagPhotoTransactional', () => {
    it('updates photoAssetId and deletes old asset atomically', async () => {
      const oldId = 'photo-old-asset';
      const newId = 'photo-new-asset';

      await savePhotoAsset(new Blob(['old']), { id: oldId, mimeType: 'image/png' });
      await savePhotoAsset(new Blob(['new']), { id: newId, mimeType: 'image/png' });

      await saveTag({
        uid: '04112233445566',
        name: 'Tag 1',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: oldId
      });

      const res = await updateTagPhotoTransactional('04112233445566', {
        photoAssetId: newId,
        photoUrl: null
      });

      expect(res.success).toBe(true);
      expect(res.tag?.photoAssetId).toBe(newId);

      const reloadedTag = await getTagByUid('04112233445566');
      expect(reloadedTag?.photoAssetId).toBe(newId);
      expect(await getPhotoAsset(oldId)).toBeNull();
      expect(await getPhotoAsset(newId)).not.toBeNull();
    });

    it('updating photoUrl only does NOT delete photo asset in IndexedDB', async () => {
      const assetId = 'photo-keep-on-url-update';
      await savePhotoAsset(new Blob(['photo']), { id: assetId, mimeType: 'image/png' });

      await saveTag({
        uid: '04112233445566',
        name: 'Tag 1',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: assetId
      });

      const res = await updateTagPhotoTransactional('04112233445566', {
        photoUrl: 'https://example.com/thumb.jpg'
      });

      expect(res.success).toBe(true);
      expect(res.tag?.photoAssetId).toBe(assetId);
      expect(res.tag?.photoUrl).toBe('https://example.com/thumb.jpg');

      expect(await getPhotoAsset(assetId)).not.toBeNull();
    });

    it('returns error if tag does not exist', async () => {
      const res = await updateTagPhotoTransactional('04999999999999', {
        photoAssetId: 'photo-not-exist'
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('not found');
    });
  });
});
