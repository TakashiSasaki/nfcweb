// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  generatePhotoAssetId, 
  savePhotoAsset, 
  getPhotoAsset, 
  getPhotoAssetBlob, 
  deletePhotoAsset, 
  deletePhotoAssets,
  normalizeImage
} from './photoAssetStorage';

describe('Photo Asset Storage (IndexedDB) & Normalization', () => {
  it('generates unique photo asset IDs with photo- prefix', () => {
    const id1 = generatePhotoAssetId();
    const id2 = generatePhotoAssetId();
    expect(id1).toMatch(/^photo-/);
    expect(id2).toMatch(/^photo-/);
    expect(id1).not.toBe(id2);
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
});
