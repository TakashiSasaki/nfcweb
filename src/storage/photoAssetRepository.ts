/**
 * Photo Asset Repository for durable binary image storage in `nfcweb_db`.
 */

import { getUnifiedDB, STORE_PHOTO_ASSETS, _resetUnifiedDBForTesting } from './database';

export interface StoredPhotoAsset {
  id: string;
  blob: Blob;
  mimeType: string;
  byteSize: number;
  createdAt: number;
  updatedAt: number;
  width?: number;
  height?: number;
}

export function _resetDBForTesting(): void {
  _resetUnifiedDBForTesting().catch(() => {});
}

/**
 * Generate a unique photo asset ID
 */
export function generatePhotoAssetId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `photo-${crypto.randomUUID()}`;
  }
  return `photo-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Save a binary Blob into IndexedDB photo storage
 */
export async function savePhotoAsset(
  blob: Blob,
  metadata?: { id?: string; width?: number; height?: number; mimeType?: string }
): Promise<string> {
  const db = await getUnifiedDB();
  const id = metadata?.id || generatePhotoAssetId();
  const now = Date.now();

  const record: StoredPhotoAsset = {
    id,
    blob,
    mimeType: metadata?.mimeType || blob.type || 'image/jpeg',
    byteSize: blob.size,
    createdAt: now,
    updatedAt: now,
    width: metadata?.width,
    height: metadata?.height
  };

  return new Promise<string>((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_PHOTO_ASSETS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_ASSETS);
      const req = store.put(record);

      req.onsuccess = () => resolve(id);
      req.onerror = () => reject(req.error || new Error('Failed to save photo asset to IndexedDB'));
      tx.onerror = () => reject(tx.error || new Error('Transaction failed while saving photo asset'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieve a stored photo asset by ID
 */
export async function getPhotoAsset(assetId: string): Promise<StoredPhotoAsset | null> {
  if (!assetId) return null;
  try {
    const db = await getUnifiedDB();
    return new Promise<StoredPhotoAsset | null>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTO_ASSETS, 'readonly');
      const store = tx.objectStore(STORE_PHOTO_ASSETS);
      const req = store.get(assetId);

      req.onsuccess = () => {
        resolve((req.result as StoredPhotoAsset) || null);
      };

      req.onerror = () => {
        reject(req.error || new Error(`Failed to load photo asset ${assetId}`));
      };
    });
  } catch (err) {
    console.warn('Error fetching photo asset from IndexedDB:', err);
    return null;
  }
}

/**
 * Retrieve the raw Blob for a photo asset ID
 */
export async function getPhotoAssetBlob(assetId: string): Promise<Blob | null> {
  const asset = await getPhotoAsset(assetId);
  return asset ? asset.blob : null;
}

/**
 * Delete a photo asset by ID
 */
export async function deletePhotoAsset(assetId: string): Promise<void> {
  if (!assetId) return;
  try {
    const db = await getUnifiedDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTO_ASSETS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_ASSETS);
      const req = store.delete(assetId);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error(`Failed to delete photo asset ${assetId}`));
      tx.onerror = () => reject(tx.error || new Error(`Transaction failed while deleting photo asset ${assetId}`));
    });
  } catch (err) {
    console.warn('Error deleting photo asset from IndexedDB:', err);
  }
}

/**
 * Delete multiple photo assets by ID
 */
export async function deletePhotoAssets(assetIds: string[]): Promise<void> {
  const validIds = assetIds.filter(Boolean);
  if (validIds.length === 0) return;
  try {
    const db = await getUnifiedDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTO_ASSETS, 'readwrite');
      const store = tx.objectStore(STORE_PHOTO_ASSETS);

      for (const id of validIds) {
        store.delete(id);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaction failed while deleting photo assets'));
    });
  } catch (err) {
    console.warn('Error batch deleting photo assets from IndexedDB:', err);
  }
}

/**
 * Returns all photo asset IDs stored in IndexedDB.
 */
export async function getAllPhotoAssetIds(): Promise<string[]> {
  try {
    const db = await getUnifiedDB();
    return new Promise<string[]>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTO_ASSETS, 'readonly');
      const store = tx.objectStore(STORE_PHOTO_ASSETS);
      const req = store.getAllKeys();

      req.onsuccess = () => {
        const keys = (req.result as string[]) || [];
        resolve(keys);
      };

      req.onerror = () => reject(req.error || new Error('Failed to load photo asset keys'));
    });
  } catch (err) {
    console.warn('Error getting all photo asset keys:', err);
    return [];
  }
}

/**
 * Returns total count of photo assets stored in IndexedDB.
 */
export async function countPhotoAssets(): Promise<number> {
  try {
    const db = await getUnifiedDB();
    return new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_PHOTO_ASSETS, 'readonly');
      const store = tx.objectStore(STORE_PHOTO_ASSETS);
      const req = store.count();

      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error || new Error('Failed to count photo assets'));
    });
  } catch (err) {
    console.warn('Error counting photo assets:', err);
    return 0;
  }
}

/**
 * Resizes and normalizes an image File or Blob to a maximum dimension,
 * returning a compressed JPEG or PNG Blob ready for local IndexedDB persistence.
 */
export async function normalizeImage(
  fileOrBlob: Blob | File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<{ blob: Blob; width: number; height: number; mimeType: string }> {
  const maxDimension = options.maxDimension || 1280;
  const quality = options.quality !== undefined ? options.quality : 0.85;

  // SVG images can be stored directly
  if (fileOrBlob.type === 'image/svg+xml') {
    return {
      blob: fileOrBlob,
      width: 100,
      height: 100,
      mimeType: 'image/svg+xml'
    };
  }

  // If in environment without browser / DOM, store directly
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      blob: fileOrBlob,
      width: 0,
      height: 0,
      mimeType: fileOrBlob.type || 'image/jpeg'
    };
  }

  const outputType = fileOrBlob.type === 'image/png' ? 'image/png' : 'image/jpeg';

  const scaleDimensions = (srcW: number, srcH: number) => {
    let width = srcW;
    let height = srcH;
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }
    return { width, height };
  };

  // Strategy 1: createImageBitmap (fast modern browser decoding)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(fileOrBlob);
      try {
        const { width, height } = scaleDimensions(bitmap.width, bitmap.height);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D rendering context is not available');
        }
        ctx.drawImage(bitmap, 0, 0, width, height);
        const normalizedBlob = await new Promise<Blob | null>((resolve) => {
          if (typeof canvas.toBlob === 'function') {
            canvas.toBlob(resolve, outputType, quality);
          } else {
            resolve(null);
          }
        });
        if (!normalizedBlob) {
          throw new Error('Failed to encode normalized image to Blob format');
        }
        return {
          blob: normalizedBlob,
          width,
          height,
          mimeType: outputType
        };
      } finally {
        bitmap.close();
      }
    } catch (err: any) {
      if (fileOrBlob.size === 0 || err?.name === 'InvalidStateError') {
        throw new Error('Failed to decode image data. Please provide a valid image format.');
      }
      // If createImageBitmap fails for environmental / format reasons, fall through to Image
    }
  }

  // Strategy 2: HTMLImageElement fallback (Image constructor)
  if (typeof Image === 'undefined') {
    throw new Error('Image decoding is not supported in this environment');
  }

  return new Promise((resolve, reject) => {
    let objectUrl = '';
    try {
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        objectUrl = URL.createObjectURL(fileOrBlob);
      }
    } catch (e) {
      return reject(new Error('Failed to create object URL for image file.'));
    }

    if (!objectUrl) {
      return reject(new Error('Failed to create object URL for image file.'));
    }

    let isSettled = false;
    const cleanup = () => {
      if (objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (_) {}
      }
    };

    const img = new Image();

    img.onload = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;

      if (!naturalW || !naturalH) {
        reject(new Error('Failed to decode image dimensions.'));
        return;
      }

      const { width, height } = scaleDimensions(naturalW, naturalH);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D rendering context is not available'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to encode normalized image to Blob format'));
              return;
            }
            resolve({
              blob,
              width,
              height,
              mimeType: outputType
            });
          },
          outputType,
          quality
        );
      } else {
        reject(new Error('Canvas toBlob is not supported'));
      }
    };

    img.onerror = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(new Error('Failed to load image file for normalization. Please provide a valid image format.'));
    };

    img.src = objectUrl;
  });
}

/**
 * Helper: Normalizes an uploaded image and persists it to IndexedDB, returning the generated assetId.
 */
export async function normalizeAndStorePhoto(
  fileOrBlob: Blob | File,
  options?: { maxDimension?: number; quality?: number }
): Promise<string> {
  const normalized = await normalizeImage(fileOrBlob, options);
  return savePhotoAsset(normalized.blob, {
    width: normalized.width,
    height: normalized.height,
    mimeType: normalized.mimeType
  });
}
