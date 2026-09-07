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
  normalizeAndStorePhoto,
  _resetDBForTesting
} from './photoAssetStorage';

describe('Photo Asset Storage (IndexedDB) & Normalization', () => {
  beforeEach(async () => {
    await _resetDBForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('normalizes via createImageBitmap with proper aspect scaling and bitmap cleanup', async () => {
    const closeMock = vi.fn();
    const mockBitmap = {
      width: 2560,
      height: 1440,
      close: closeMock
    };

    (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue(mockBitmap);

    const drawImageMock = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: drawImageMock
    } as any);

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(this: any, callback: any, type?: string) {
      callback(new Blob(['normalized-jpeg-data'], { type: type || 'image/jpeg' }));
    });

    const inputBlob = new Blob(['fake-jpg-binary'], { type: 'image/jpeg' });
    const result = await normalizeImage(inputBlob, { maxDimension: 1280, quality: 0.8 });

    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.blob).toBeInstanceOf(Blob);
    expect(drawImageMock).toHaveBeenCalledWith(mockBitmap, 0, 0, 1280, 720);
    expect(closeMock).toHaveBeenCalled();
  });

  it('normalizes via HTMLImageElement fallback when createImageBitmap is unavailable', async () => {
    (globalThis as any).createImageBitmap = undefined;

    const createObjectURLMock = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-url');
    const revokeObjectURLMock = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const drawImageMock = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: drawImageMock
    } as any);

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(this: any, callback: any, type?: string) {
      callback(new Blob(['fallback-png-data'], { type: type || 'image/png' }));
    });

    // Mock Image constructor behavior
    const originalImage = globalThis.Image;
    (globalThis as any).Image = class {
      naturalWidth = 1000;
      naturalHeight = 2000;
      onload: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      set src(_value: string) {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ type: 'load' });
          }
        }, 0);
      }
    };

    try {
      const inputBlob = new Blob(['fake-png-binary'], { type: 'image/png' });
      const result = await normalizeImage(inputBlob, { maxDimension: 1280 });

      expect(result.width).toBe(640);
      expect(result.height).toBe(1280);
      expect(result.mimeType).toBe('image/png');
      expect(createObjectURLMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/mock-url');
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it('rejects with error when image decoding fails and revokes object URL', async () => {
    (globalThis as any).createImageBitmap = undefined;

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-fail-url');
    const revokeObjectURLMock = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const originalImage = globalThis.Image;
    (globalThis as any).Image = class {
      onload: ((event: any) => void) | null = null;
      onerror: ((event: any) => void) | null = null;
      set src(_value: string) {
        setTimeout(() => {
          if (this.onerror) {
            this.onerror(new Error('Corrupted data'));
          }
        }, 0);
      }
    };

    try {
      const inputBlob = new Blob(['corrupted-data'], { type: 'image/jpeg' });
      await expect(normalizeImage(inputBlob)).rejects.toThrow(/Failed to load image file for normalization/);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/mock-fail-url');
    } finally {
      globalThis.Image = originalImage;
    }
  });

  it('scales dimensions correctly without upscaling smaller images', async () => {
    const mockBitmap = {
      width: 600,
      height: 400,
      close: vi.fn()
    };
    (globalThis as any).createImageBitmap = vi.fn().mockResolvedValue(mockBitmap);

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn()
    } as any);

    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function(this: any, callback: any) {
      callback(new Blob(['blob'], { type: 'image/jpeg' }));
    });

    const inputBlob = new Blob(['data'], { type: 'image/jpeg' });
    const result = await normalizeImage(inputBlob, { maxDimension: 1280 });

    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
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
