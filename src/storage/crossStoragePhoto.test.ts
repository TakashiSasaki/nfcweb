// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  savePhotoAsset, 
  getPhotoAsset, 
  deletePhotoAsset, 
  deletePhotoAssets,
  _resetDBForTesting 
} from './photoAssetStorage';
import { 
  loadTagRegistry, 
  saveTagRegistry, 
  commitTagRegistry 
} from './tagRegistryStorage';
import { applyTagPhotoUpdate } from './tagPhotoMutation';
import { NFCTagItem, PhotoUpdate } from '../types';
import { buildImportPlan, applyImportPlan } from '../data-format/import-plan';
import { TagRegistryExportDocumentV1 } from '../data-format/types';

class LocalStorageMock {
  private store: Record<string, string> = {};
  clear() { this.store = {}; }
  getItem(key: string): string | null { return this.store[key] ?? null; }
  setItem(key: string, value: string) { this.store[key] = String(value); }
  removeItem(key: string) { delete this.store[key]; }
}

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = new LocalStorageMock();
}

describe('Cross-Storage Photo & Registry Semantics (Production Logic)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await _resetDBForTesting();
    vi.restoreAllMocks();
  });

  it('1. successful add photo: commits to registry and retains asset in IndexedDB', async () => {
    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [] }
    ];
    saveTagRegistry(currentTags);

    const assetId = 'photo-new-123';
    await savePhotoAsset(new Blob(['img']), { id: assetId, mimeType: 'image/png' });

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04112233445566',
      update: { photoAssetId: assetId, photoUrl: null },
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(true);
    expect(currentTags[0].photoAssetId).toBe(assetId);
    expect(await getPhotoAsset(assetId)).not.toBeNull();

    const loaded = loadTagRegistry();
    expect(loaded[0].photoAssetId).toBe(assetId);
  });

  it('2. failed metadata persist rolls back newly created asset without modifying state', async () => {
    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [] }
    ];
    saveTagRegistry(currentTags);

    const assetId = 'photo-orphan-candidate';
    await savePhotoAsset(new Blob(['img']), { id: assetId, mimeType: 'image/png' });

    // Mock localStorage failure
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('Quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    });

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04112233445566',
      update: { photoAssetId: assetId, photoUrl: null },
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(false);
    expect(currentTags[0].photoAssetId).toBeUndefined();
    // Orphan asset must be rolled back (deleted)
    expect(await getPhotoAsset(assetId)).toBeNull();
  });

  it('3. successful replace photo cleans up old asset only after durable registry commit', async () => {
    const oldAssetId = 'photo-old-111';
    const newAssetId = 'photo-new-222';

    await savePhotoAsset(new Blob(['old']), { id: oldAssetId, mimeType: 'image/png' });
    await savePhotoAsset(new Blob(['new']), { id: newAssetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: oldAssetId }
    ];
    saveTagRegistry(currentTags);

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04112233445566',
      update: { photoAssetId: newAssetId, photoUrl: null },
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(true);
    expect(currentTags[0].photoAssetId).toBe(newAssetId);
    expect(await getPhotoAsset(oldAssetId)).toBeNull();
    expect(await getPhotoAsset(newAssetId)).not.toBeNull();

    const loaded = loadTagRegistry();
    expect(loaded[0].photoAssetId).toBe(newAssetId);
  });

  it('4. failed replace photo preserves old asset and deletes new asset candidate', async () => {
    const oldAssetId = 'photo-old-preserved';
    const newAssetId = 'photo-new-failed';

    await savePhotoAsset(new Blob(['old']), { id: oldAssetId, mimeType: 'image/png' });
    await savePhotoAsset(new Blob(['new']), { id: newAssetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: oldAssetId }
    ];
    saveTagRegistry(currentTags);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Disk full');
    });

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04112233445566',
      update: { photoAssetId: newAssetId, photoUrl: null },
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(false);
    expect(currentTags[0].photoAssetId).toBe(oldAssetId);
    expect(await getPhotoAsset(oldAssetId)).not.toBeNull();
    expect(await getPhotoAsset(newAssetId)).toBeNull();
  });

  it('5. successful remove photo deletes old asset from IndexedDB', async () => {
    const oldAssetId = 'photo-to-remove';
    await savePhotoAsset(new Blob(['data']), { id: oldAssetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: oldAssetId, photoUrl: 'https://example.com/test.jpg' }
    ];
    saveTagRegistry(currentTags);

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04112233445566',
      update: { photoAssetId: null, photoUrl: null },
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(true);
    expect(currentTags[0].photoAssetId).toBeUndefined();
    expect(currentTags[0].photoUrl).toBeUndefined();
    expect(await getPhotoAsset(oldAssetId)).toBeNull();

    const loaded = loadTagRegistry();
    expect(loaded[0].photoAssetId).toBeUndefined();
  });

  it('6. failed remove photo registry commit preserves old asset and in-memory state', async () => {
    const oldAssetId = 'photo-stay-after-fail';
    await savePhotoAsset(new Blob(['data']), { id: oldAssetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: oldAssetId }
    ];
    saveTagRegistry(currentTags);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage write failed');
    });

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04112233445566',
      update: { photoAssetId: null },
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(false);
    expect(currentTags[0].photoAssetId).toBe(oldAssetId);
    expect(await getPhotoAsset(oldAssetId)).not.toBeNull();
  });

  it('7. photoUrl-only update preserves photoAssetId and does NOT delete IndexedDB asset', async () => {
    const assetId = 'photo-existing-123';
    await savePhotoAsset(new Blob(['data']), { id: assetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: assetId, photoUrl: 'https://example.com/old.jpg' }
    ];
    saveTagRegistry(currentTags);

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04112233445566',
      update: { photoUrl: 'https://example.com/new.jpg' },
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(true);
    expect(currentTags[0].photoAssetId).toBe(assetId);
    expect(currentTags[0].photoUrl).toBe('https://example.com/new.jpg');
    // Crucial fix assertion: IndexedDB asset must NOT be deleted
    expect(await getPhotoAsset(assetId)).not.toBeNull();

    const loaded = loadTagRegistry();
    expect(loaded[0].photoAssetId).toBe(assetId);
    expect(loaded[0].photoUrl).toBe('https://example.com/new.jpg');
  });

  it('8. empty / no-op photo update preserves all fields and deletes nothing', async () => {
    const assetId = 'photo-noop-test';
    await savePhotoAsset(new Blob(['data']), { id: assetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: assetId, photoUrl: 'https://example.com/pic.jpg' }
    ];
    saveTagRegistry(currentTags);

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04112233445566',
      update: {},
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(true);
    expect(currentTags[0].photoAssetId).toBe(assetId);
    expect(currentTags[0].photoUrl).toBe('https://example.com/pic.jpg');
    expect(await getPhotoAsset(assetId)).not.toBeNull();
  });

  it('9. explicit photoUrl: null clears photoUrl but preserves photoAssetId and IndexedDB asset', async () => {
    const assetId = 'photo-keep-me';
    await savePhotoAsset(new Blob(['data']), { id: assetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: assetId, photoUrl: 'https://example.com/remove-url.jpg' }
    ];
    saveTagRegistry(currentTags);

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04112233445566',
      update: { photoUrl: null },
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(true);
    expect(currentTags[0].photoAssetId).toBe(assetId);
    expect(currentTags[0].photoUrl).toBeUndefined();
    expect(await getPhotoAsset(assetId)).not.toBeNull();

    const loaded = loadTagRegistry();
    expect(loaded[0].photoAssetId).toBe(assetId);
    expect(loaded[0].photoUrl).toBeUndefined();
  });

  it('10. tag-not-found rolls back newly supplied photo asset candidate', async () => {
    const candidateAssetId = 'photo-orphan-tag-not-found';
    await savePhotoAsset(new Blob(['data']), { id: candidateAssetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [] }
    ];
    saveTagRegistry(currentTags);

    const result = await applyTagPhotoUpdate({
      tags: currentTags,
      uid: '04999999999999', // Not in tags
      update: { photoAssetId: candidateAssetId },
      onCommit: (persisted) => { currentTags = persisted; }
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
    expect(await getPhotoAsset(candidateAssetId)).toBeNull();
  });
});

describe('Import & Export Photo Lifecycle Semantics', () => {
  beforeEach(async () => {
    localStorage.clear();
    await _resetDBForTesting();
    vi.restoreAllMocks();
  });

  it('merge import preserves local photoAssetId and photoUrl on matching UID', async () => {
    const assetId = 'photo-merge-preserved';
    await savePhotoAsset(new Blob(['data']), { id: assetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      {
        uid: '04112233445566',
        name: 'Local Name',
        firstSeen: 1000,
        lastRead: 1000,
        readCount: 1,
        hasNdef: false,
        records: [],
        photoAssetId: assetId,
        photoUrl: 'https://example.com/local.jpg'
      }
    ];
    saveTagRegistry(currentTags);

    const incomingDoc: TagRegistryExportDocumentV1 = {
      format: 'nfcweb-tag-registry',
      schemaVersion: 1,
      exportedAt: '2026-09-07T00:00:00.000Z',
      appVersion: '1.0.63',
      tags: [
        {
          uid: '04112233445566',
          name: 'Imported Canonical Name',
          firstSeen: 1000,
          lastRead: 1500,
          readCount: 5,
          hasNdef: true,
          records: [{ id: 'r1', recordType: 'text', data: 'hello', lang: 'en' }]
        }
      ]
    };

    const plan = buildImportPlan(incomingDoc, currentTags, 'merge');
    const resultingTags = applyImportPlan(plan);

    const commitRes = commitTagRegistry(resultingTags, (persisted) => {
      currentTags = persisted;
    });

    expect(commitRes.success).toBe(true);
    expect(currentTags[0].name).toBe('Imported Canonical Name');
    expect(currentTags[0].photoAssetId).toBe(assetId);
    expect(currentTags[0].photoUrl).toBe('https://example.com/local.jpg');
    expect(await getPhotoAsset(assetId)).not.toBeNull();
  });

  it('replace import cleans up unreferenced old assets ONLY after successful commit', async () => {
    const oldAssetId1 = 'photo-to-be-orphaned-1';
    const oldAssetId2 = 'photo-to-be-orphaned-2';
    await savePhotoAsset(new Blob(['1']), { id: oldAssetId1, mimeType: 'image/png' });
    await savePhotoAsset(new Blob(['2']), { id: oldAssetId2, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: oldAssetId1 },
      { uid: '04998877665544', name: 'Tag 2', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: oldAssetId2 }
    ];
    saveTagRegistry(currentTags);

    const incomingDoc: TagRegistryExportDocumentV1 = {
      format: 'nfcweb-tag-registry',
      schemaVersion: 1,
      exportedAt: '2026-09-07T00:00:00.000Z',
      appVersion: '1.0.63',
      tags: [
        {
          uid: '04aabbccddeeff',
          name: 'Brand New Imported Tag',
          firstSeen: 2000,
          lastRead: 2000,
          readCount: 1,
          hasNdef: false,
          records: []
        }
      ]
    };

    const plan = buildImportPlan(incomingDoc, currentTags, 'replace');
    const resultingTags = applyImportPlan(plan);

    // Simulate import handler logic in store (importTagsRegistry)
    const previousAssetIds = new Set<string>(
      currentTags.map(t => t.photoAssetId).filter((id): id is string => Boolean(id))
    );
    const newAssetIds = new Set<string>(
      resultingTags.map(t => t.photoAssetId).filter((id): id is string => Boolean(id))
    );
    const unreferencedAssetIds = Array.from(previousAssetIds).filter(id => !newAssetIds.has(id));

    const commitRes = commitTagRegistry(resultingTags, (persisted) => {
      currentTags = persisted;
    });

    if (commitRes.success && unreferencedAssetIds.length > 0) {
      await deletePhotoAssets(unreferencedAssetIds);
    }

    expect(commitRes.success).toBe(true);
    expect(currentTags.length).toBe(1);
    expect(currentTags[0].uid).toBe('04aabbccddeeff');

    // Both old assets must be deleted
    expect(await getPhotoAsset(oldAssetId1)).toBeNull();
    expect(await getPhotoAsset(oldAssetId2)).toBeNull();
  });

  it('failed replace import preserves old registry and existing assets', async () => {
    const assetId = 'photo-preserve-on-replace-fail';
    await savePhotoAsset(new Blob(['keep']), { id: assetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: assetId }
    ];
    saveTagRegistry(currentTags);

    const incomingDoc: TagRegistryExportDocumentV1 = {
      format: 'nfcweb-tag-registry',
      schemaVersion: 1,
      exportedAt: '2026-09-07T00:00:00.000Z',
      appVersion: '1.0.63',
      tags: [
        {
          uid: '04aabbccddeeff',
          name: 'New Tag',
          firstSeen: 2000,
          lastRead: 2000,
          readCount: 1,
          hasNdef: false,
          records: []
        }
      ]
    };

    const plan = buildImportPlan(incomingDoc, currentTags, 'replace');
    const resultingTags = applyImportPlan(plan);

    const previousAssetIds = new Set<string>(
      currentTags.map(t => t.photoAssetId).filter((id): id is string => Boolean(id))
    );
    const newAssetIds = new Set<string>(
      resultingTags.map(t => t.photoAssetId).filter((id): id is string => Boolean(id))
    );
    const unreferencedAssetIds = Array.from(previousAssetIds).filter(id => !newAssetIds.has(id));

    // Simulate write error
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Disk full');
    });

    const commitRes = commitTagRegistry(resultingTags, (persisted) => {
      currentTags = persisted;
    });

    if (commitRes.success && unreferencedAssetIds.length > 0) {
      await deletePhotoAssets(unreferencedAssetIds);
    }

    expect(commitRes.success).toBe(false);
    expect(currentTags.length).toBe(1);
    expect(currentTags[0].photoAssetId).toBe(assetId);
    expect(await getPhotoAsset(assetId)).not.toBeNull();
  });
});

