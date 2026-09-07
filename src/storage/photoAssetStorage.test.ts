// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generatePhotoAssetId,
  savePhotoAsset,
  getPhotoAsset,
  getPhotoAssetBlob,
  deletePhotoAsset,
  deletePhotoAssets,
  normalizeImage,
  _resetDBForTesting
} from './photoAssetStorage';

describe('Photo Asset Repository & Normalization', () => {
  beforeEach(async () => {
    await _resetDBForTesting();
    vi.restoreAllMocks();
  });
  afterEach(() => vi.restoreAllMocks());

  it('generates unique photo asset IDs', () => {
    const id1 = generatePhotoAssetId();
    const id2 = generatePhotoAssetId();
    expect(id1).toMatch(/^photo-/);
    expect(id2).toMatch(/^photo-/);
    expect(id1).not.toBe(id2);
  });

  it('saves and retrieves photo assets', async () => {
    const id = generatePhotoAssetId();
    const blob = new Blob(['sample-image-data'], { type: 'image/jpeg' });
    await savePhotoAsset(blob, { id, mimeType: 'image/jpeg' });
    const record = await getPhotoAsset(id);
    expect(record?.id).toBe(id);
    expect(record?.mimeType).toBe('image/jpeg');
    expect(record?.byteSize).toBe(blob.size);
    expect(await getPhotoAssetBlob(id)).not.toBeNull();
  });

  it('returns null for a missing asset', async () => {
    expect(await getPhotoAsset('missing')).toBeNull();
    expect(await getPhotoAssetBlob('missing')).toBeNull();
  });

  it('deletes one photo asset', async () => {
    const id = generatePhotoAssetId();
    await savePhotoAsset(new Blob(['delete-me']), { id, mimeType: 'image/png' });
    await deletePhotoAsset(id);
    expect(await getPhotoAsset(id)).toBeNull();
  });

  it('deletes multiple photo assets atomically', async () => {
    await savePhotoAsset(new Blob(['1']), { id: 'p1', mimeType: 'image/png' });
    await savePhotoAsset(new Blob(['2']), { id: 'p2', mimeType: 'image/png' });
    await savePhotoAsset(new Blob(['3']), { id: 'p3', mimeType: 'image/png' });
    await deletePhotoAssets(['p1', 'p2']);
    expect(await getPhotoAsset('p1')).toBeNull();
    expect(await getPhotoAsset('p2')).toBeNull();
    expect(await getPhotoAsset('p3')).not.toBeNull();
  });

  it('passes SVG blobs through normalization', async () => {
    const svg = new Blob(['<svg><rect width="10" height="10"/></svg>'], { type: 'image/svg+xml' });
    const result = await normalizeImage(svg);
    expect(result.blob).toBe(svg);
    expect(result.mimeType).toBe('image/svg+xml');
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('normalizes with createImageBitmap and closes the bitmap', async () => {
    const close = vi.fn();
    const bitmap = { width: 2560, height: 1440, close };
    (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(_callback: any, type?: string) {
      _callback(new Blob(['normalized'], { type: type || 'image/jpeg' }));
    });

    const result = await normalizeImage(new Blob(['jpg'], { type: 'image/jpeg' }), { maxDimension: 1280, quality: 0.8 });
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.mimeType).toBe('image/jpeg');
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1280, 720);
    expect(close).toHaveBeenCalled();
  });

  it('uses HTMLImageElement fallback when createImageBitmap is unavailable', async () => {
    (globalThis as any).createImageBitmap = undefined;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-url');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(callback: any, type?: string) {
      callback(new Blob(['fallback'], { type: type || 'image/png' }));
    });
    const originalImage = globalThis.Image;
    (globalThis as any).Image = class {
      naturalWidth = 1000;
      naturalHeight = 2000;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { setTimeout(() => this.onload?.(), 0); }
    };
    try {
      const result = await normalizeImage(new Blob(['png'], { type: 'image/png' }), { maxDimension: 1280 });
      expect(result.width).toBe(640);
      expect(result.height).toBe(1280);
      expect(revoke).toHaveBeenCalledWith('blob:http://localhost/mock-url');
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it('rejects corrupted image data and revokes its object URL', async () => {
    (globalThis as any).createImageBitmap = undefined;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-fail-url');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const originalImage = globalThis.Image;
    (globalThis as any).Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { setTimeout(() => this.onerror?.(), 0); }
    };
    try {
      await expect(normalizeImage(new Blob(['bad'], { type: 'image/jpeg' }))).rejects.toThrow(/Failed to load image file/);
      expect(revoke).toHaveBeenCalledWith('blob:http://localhost/mock-fail-url');
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it('does not upscale small images', async () => {
    const bitmap = { width: 600, height: 400, close: vi.fn() };
    (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(callback: any) {
      callback(new Blob(['blob'], { type: 'image/jpeg' }));
    });
    const result = await normalizeImage(new Blob(['data'], { type: 'image/jpeg' }), { maxDimension: 1280 });
    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
  });
});
