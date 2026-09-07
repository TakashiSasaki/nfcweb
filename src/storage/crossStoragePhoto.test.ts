// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  savePhotoAsset, 
  getPhotoAsset, 
  deletePhotoAsset, 
  _resetDBForTesting 
} from './photoAssetStorage';
import { 
  loadTagRegistry, 
  saveTagRegistry, 
  clearTagRegistry, 
  commitTagRegistry 
} from './tagRegistryStorage';
import { NFCTagItem, PhotoUpdate } from '../types';

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

describe('Cross-Storage Photo & Registry Semantics', () => {
  beforeEach(async () => {
    localStorage.clear();
    await _resetDBForTesting();
    vi.restoreAllMocks();
  });

  // Simulated Store Helper replicating store.ts behavior
  async function simulateUpdateTagPhoto(
    tags: NFCTagItem[],
    setTags: (tags: NFCTagItem[]) => void,
    uid: string,
    update: PhotoUpdate
  ): Promise<{ success: boolean; error?: string }> {
    const currentTag = tags.find(t => t.uid === uid);
    if (!currentTag) {
      if (update.photoAssetId) {
        await deletePhotoAsset(update.photoAssetId).catch(() => {});
      }
      return { success: false, error: 'Tag not found' };
    }

    const oldAssetId = currentTag.photoAssetId;
    const newAssetId = update.photoAssetId;

    const candidateTags = tags.map(t => {
      if (t.uid === uid) {
        const next: NFCTagItem = { ...t };
        if (update.photoAssetId !== undefined) {
          if (update.photoAssetId === null) {
            delete next.photoAssetId;
          } else {
            next.photoAssetId = update.photoAssetId;
          }
        }
        if (update.photoUrl !== undefined) {
          if (update.photoUrl === null) {
            delete next.photoUrl;
          } else {
            next.photoUrl = update.photoUrl;
          }
        }
        return next;
      }
      return t;
    });

    const commitResult = commitTagRegistry(candidateTags, (persisted) => {
      setTags(persisted);
    });

    if (!commitResult.success) {
      if (newAssetId && newAssetId !== oldAssetId) {
        await deletePhotoAsset(newAssetId).catch(() => {});
      }
      return { success: false, error: commitResult.error };
    }

    if (oldAssetId && oldAssetId !== newAssetId) {
      await deletePhotoAsset(oldAssetId).catch(() => {});
    }

    return { success: true };
  }

  it('successful add photo: commits to registry and retains asset in IndexedDB', async () => {
    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [] }
    ];
    saveTagRegistry(currentTags);

    const assetId = 'photo-new-123';
    await savePhotoAsset(new Blob(['img']), { id: assetId, mimeType: 'image/png' });

    const result = await simulateUpdateTagPhoto(
      currentTags,
      (persisted) => { currentTags = persisted; },
      '04112233445566',
      { photoAssetId: assetId, photoUrl: null }
    );

    expect(result.success).toBe(true);
    expect(currentTags[0].photoAssetId).toBe(assetId);
    expect(await getPhotoAsset(assetId)).not.toBeNull();

    const loaded = loadTagRegistry();
    expect(loaded[0].photoAssetId).toBe(assetId);
  });

  it('failed metadata persist rolls back newly created asset without modifying state', async () => {
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

    const result = await simulateUpdateTagPhoto(
      currentTags,
      (persisted) => { currentTags = persisted; },
      '04112233445566',
      { photoAssetId: assetId, photoUrl: null }
    );

    expect(result.success).toBe(false);
    expect(currentTags[0].photoAssetId).toBeUndefined();
    // Orphan asset must be rolled back (deleted)
    expect(await getPhotoAsset(assetId)).toBeNull();
  });

  it('successful replace photo cleans up old asset only after durable registry commit', async () => {
    const oldAssetId = 'photo-old-111';
    const newAssetId = 'photo-new-222';

    await savePhotoAsset(new Blob(['old']), { id: oldAssetId, mimeType: 'image/png' });
    await savePhotoAsset(new Blob(['new']), { id: newAssetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: oldAssetId }
    ];
    saveTagRegistry(currentTags);

    const result = await simulateUpdateTagPhoto(
      currentTags,
      (persisted) => { currentTags = persisted; },
      '04112233445566',
      { photoAssetId: newAssetId, photoUrl: null }
    );

    expect(result.success).toBe(true);
    expect(currentTags[0].photoAssetId).toBe(newAssetId);
    expect(await getPhotoAsset(oldAssetId)).toBeNull();
    expect(await getPhotoAsset(newAssetId)).not.toBeNull();
  });

  it('failed replace photo preserves old asset and deletes new asset candidate', async () => {
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

    const result = await simulateUpdateTagPhoto(
      currentTags,
      (persisted) => { currentTags = persisted; },
      '04112233445566',
      { photoAssetId: newAssetId, photoUrl: null }
    );

    expect(result.success).toBe(false);
    expect(currentTags[0].photoAssetId).toBe(oldAssetId);
    expect(await getPhotoAsset(oldAssetId)).not.toBeNull();
    expect(await getPhotoAsset(newAssetId)).toBeNull();
  });

  it('successful remove photo deletes old asset from IndexedDB', async () => {
    const oldAssetId = 'photo-to-remove';
    await savePhotoAsset(new Blob(['data']), { id: oldAssetId, mimeType: 'image/png' });

    let currentTags: NFCTagItem[] = [
      { uid: '04112233445566', name: 'Tag 1', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [], photoAssetId: oldAssetId, photoUrl: 'https://example.com/test.jpg' }
    ];
    saveTagRegistry(currentTags);

    const result = await simulateUpdateTagPhoto(
      currentTags,
      (persisted) => { currentTags = persisted; },
      '04112233445566',
      { photoAssetId: null, photoUrl: null }
    );

    expect(result.success).toBe(true);
    expect(currentTags[0].photoAssetId).toBeUndefined();
    expect(currentTags[0].photoUrl).toBeUndefined();
    expect(await getPhotoAsset(oldAssetId)).toBeNull();
  });
});
