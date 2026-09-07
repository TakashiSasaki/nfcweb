// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { resetNfcDbForTesting } from './database';
import { saveTag, getTagByUid, getAllTags } from './tagRepository';
import { savePhotoAsset, getPhotoAsset } from './photoAssetRepository';
import { updateTagPhotoTransactional, importRegistryTransactional } from './transactionalOperations';
import { buildImportPlan, applyImportPlan } from '../data-format/import-plan';
import { TagRegistryExportDocumentV1 } from '../data-format/types';
import { NFCTagItem } from '../types';

const uid = '04112233445566';
const makeTag = (overrides: Partial<NFCTagItem> = {}): NFCTagItem => ({
  uid,
  name: 'Tag 1',
  firstSeen: 1000,
  lastRead: 1000,
  readCount: 1,
  hasNdef: false,
  records: [],
  ...overrides
});

describe('Tag/photo consistency in unified IndexedDB', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetNfcDbForTesting();
  });

  it('adds a new photo and tag reference atomically', async () => {
    await saveTag(makeTag());
    const result = await updateTagPhotoTransactional(uid, {
      newPhotoAsset: {
        id: 'photo-new',
        blob: new Blob(['image'], { type: 'image/png' }),
        mimeType: 'image/png'
      },
      photoUrl: null
    });
    expect(result.success).toBe(true);
    expect((await getTagByUid(uid))?.photoAssetId).toBe('photo-new');
    expect(await getPhotoAsset('photo-new')).not.toBeNull();
  });

  it('replaces a photo and deletes the old asset in the same transaction', async () => {
    await savePhotoAsset(new Blob(['old']), { id: 'photo-old', mimeType: 'image/png' });
    await saveTag(makeTag({ photoAssetId: 'photo-old' }));
    const result = await updateTagPhotoTransactional(uid, {
      newPhotoAsset: {
        id: 'photo-new',
        blob: new Blob(['new'], { type: 'image/png' }),
        mimeType: 'image/png'
      },
      photoUrl: null
    });
    expect(result.success).toBe(true);
    expect((await getTagByUid(uid))?.photoAssetId).toBe('photo-new');
    expect(await getPhotoAsset('photo-old')).toBeNull();
    expect(await getPhotoAsset('photo-new')).not.toBeNull();
  });

  it('removes both photo metadata and the referenced asset', async () => {
    await savePhotoAsset(new Blob(['old']), { id: 'photo-old', mimeType: 'image/png' });
    await saveTag(makeTag({ photoAssetId: 'photo-old', photoUrl: 'https://example.com/old.jpg' }));
    const result = await updateTagPhotoTransactional(uid, { photoAssetId: null, photoUrl: null });
    expect(result.success).toBe(true);
    const tag = await getTagByUid(uid);
    expect(tag?.photoAssetId).toBeUndefined();
    expect(tag?.photoUrl).toBeUndefined();
    expect(await getPhotoAsset('photo-old')).toBeNull();
  });

  it('preserves local asset when only photoUrl changes', async () => {
    await savePhotoAsset(new Blob(['photo']), { id: 'photo-keep', mimeType: 'image/png' });
    await saveTag(makeTag({ photoAssetId: 'photo-keep', photoUrl: 'https://example.com/old.jpg' }));
    const result = await updateTagPhotoTransactional(uid, { photoUrl: 'https://example.com/new.jpg' });
    expect(result.success).toBe(true);
    const tag = await getTagByUid(uid);
    expect(tag?.photoAssetId).toBe('photo-keep');
    expect(tag?.photoUrl).toBe('https://example.com/new.jpg');
    expect(await getPhotoAsset('photo-keep')).not.toBeNull();
  });

  it('treats an empty photo update as a no-op', async () => {
    await savePhotoAsset(new Blob(['photo']), { id: 'photo-keep', mimeType: 'image/png' });
    await saveTag(makeTag({ photoAssetId: 'photo-keep', photoUrl: 'https://example.com/pic.jpg' }));
    const result = await updateTagPhotoTransactional(uid, {});
    expect(result.success).toBe(true);
    const tag = await getTagByUid(uid);
    expect(tag?.photoAssetId).toBe('photo-keep');
    expect(tag?.photoUrl).toBe('https://example.com/pic.jpg');
    expect(await getPhotoAsset('photo-keep')).not.toBeNull();
  });

  it('does not persist new photo data when target tag does not exist', async () => {
    const result = await updateTagPhotoTransactional('04999999999999', {
      newPhotoAsset: {
        id: 'photo-orphan',
        blob: new Blob(['candidate']),
        mimeType: 'image/png'
      }
    });
    expect(result.success).toBe(false);
    expect(await getPhotoAsset('photo-orphan')).toBeNull();
  });
});

describe('Import/export photo semantics', () => {
  beforeEach(async () => {
    localStorage.clear();
    await resetNfcDbForTesting();
  });

  it('merge planning preserves local photo fields for matching UIDs', () => {
    const localTags: NFCTagItem[] = [makeTag({ photoAssetId: 'photo-local', photoUrl: 'https://example.com/local.jpg' })];
    const incoming: TagRegistryExportDocumentV1 = {
      format: 'nfcweb-tag-registry',
      schemaVersion: 1,
      exportedAt: '2026-09-07T00:00:00.000Z',
      appVersion: '1.0.70',
      tags: [{
        uid,
        name: 'Imported Name',
        firstSeen: 1000,
        lastRead: 2000,
        readCount: 2,
        hasNdef: false,
        records: []
      }]
    };
    const plan = buildImportPlan(incoming, localTags, 'merge');
    const resulting = applyImportPlan(plan);
    expect(resulting[0].name).toBe('Imported Name');
    expect(resulting[0].photoAssetId).toBe('photo-local');
    expect(resulting[0].photoUrl).toBe('https://example.com/local.jpg');
  });

  it('merge transaction preserves existing local photo assets', async () => {
    await savePhotoAsset(new Blob(['photo']), { id: 'photo-local', mimeType: 'image/png' });
    await saveTag(makeTag({ photoAssetId: 'photo-local' }));
    const result = await importRegistryTransactional([
      makeTag({ name: 'Imported', lastRead: 2000, readCount: 2 })
    ], 'merge');
    expect(result.success).toBe(true);
    expect((await getTagByUid(uid))?.photoAssetId).toBe('photo-local');
    expect(await getPhotoAsset('photo-local')).not.toBeNull();
  });

  it('replace transaction removes photo assets no longer referenced', async () => {
    await savePhotoAsset(new Blob(['old']), { id: 'photo-old', mimeType: 'image/png' });
    await saveTag(makeTag({ photoAssetId: 'photo-old' }));
    const result = await importRegistryTransactional([
      { ...makeTag(), uid: '04222222222222', name: 'Replacement' }
    ], 'replace');
    expect(result.success).toBe(true);
    expect(await getPhotoAsset('photo-old')).toBeNull();
    expect((await getAllTags()).map(tag => tag.uid)).toEqual(['04222222222222']);
  });
});
