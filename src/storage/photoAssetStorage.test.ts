// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  generatePhotoAssetId, 
  savePhotoAsset, 
  getPhotoAsset, 
  getPhotoAssetBlob, 
  deletePhotoAsset, 
  deletePhotoAssets,
  normalizeImage,
  normalizeAndStorePhoto,
  _resetDBForTesting
} from './photoAssetStorage';

describe('Photo Asset Storage (IndexedDB) & Normalization', () => {
  beforeEach(async () => {
    await _resetDBForTesting();
  });

  it('generates unique photo asset IDs with photo- prefix', () => {
    const id1 = generatePhotoAssetId();
    const id2 = generatePhotoAssetId();
    expect(id1).toMatch(/^photo-/);
    expect(id2).toMatch(/^photo-/);
    expect(id1).not.toBe(id2);
  });

  it('saves and retrieves photo asset records from IndexedDB', async () => {
    const assetId = generatePhotoAssetId();
    const blob = new Blob(['sample-image-data'], { type: 'image/jpeg' });
    
    await savePhotoAsset(blob, {
      id: assetId,
      mimeType: 'image/jpeg'
    });

    const record = await getPhotoAsset(assetId);
    expect(record).not.toBeNull();
    expect(record?.id).toBe(assetId);
    expect(record?.mimeType).toBe('image/jpeg');
    expect(record?.byteSize).toBe(blob.size);

    const retrievedBlob = await getPhotoAssetBlob(assetId);
    expect(retrievedBlob).not.toBeNull();
    expect(record?.byteSize).toBe(blob.size);
  });

  it('returns null for non-existent asset ID', async () => {
    const record = await getPhotoAsset('non-existent-id');
    expect(record).toBeNull();

    const blob = await getPhotoAssetBlob('non-existent-id');
    expect(blob).toBeNull();
  });

  it('deletes single photo asset from IndexedDB', async () => {
    const assetId = generatePhotoAssetId();
    const blob = new Blob(['test-delete'], { type: 'image/png' });
    
    await savePhotoAsset(blob, {
      id: assetId,
      mimeType: 'image/png'
    });

    expect(await getPhotoAsset(assetId)).not.toBeNull();

    await deletePhotoAsset(assetId);
    expect(await getPhotoAsset(assetId)).toBeNull();
    expect(await getPhotoAssetBlob(assetId)).toBeNull();
  });

  it('deletes multiple photo assets in a single batch', async () => {
    const id1 = generatePhotoAssetId();
    const id2 = generatePhotoAssetId();
    const id3 = generatePhotoAssetId();

    await savePhotoAsset(new Blob(['1']), { id: id1, mimeType: 'image/png' });
    await savePhotoAsset(new Blob(['2']), { id: id2, mimeType: 'image/png' });
    await savePhotoAsset(new Blob(['3']), { id: id3, mimeType: 'image/png' });

    await deletePhotoAssets([id1, id2]);

    expect(await getPhotoAsset(id1)).toBeNull();
    expect(await getPhotoAsset(id2)).toBeNull();
    expect(await getPhotoAsset(id3)).not.toBeNull();
  });

  it('normalizes SVG image Blobs directly without conversion', async () => {
    const svgBlob = new Blob(['<svg><rect width="10" height="10"/></svg>'], { type: 'image/svg+xml' });
    const result = await normalizeImage(svgBlob);
    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.blob).toBe(svgBlob);
  });

  it('gracefully handles headless environments in normalizeImage', async () => {
    const binaryBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: 'image/jpeg' });
    const result = await normalizeImage(binaryBlob);
    expect(result.blob).toBeDefined();
    expect(result.mimeType).toBe('image/jpeg');
  });

  it('normalizes and stores photo returning asset ID', async () => {
    const svgBlob = new Blob(['<svg><circle r="10"/></svg>'], { type: 'image/svg+xml' });
    const assetId = await normalizeAndStorePhoto(svgBlob);

    expect(assetId).toMatch(/^photo-/);
    const stored = await getPhotoAsset(assetId);
    expect(stored).not.toBeNull();
    expect(stored?.mimeType).toBe('image/svg+xml');
  });
});
