/**
 * Durable Local Item-Photo Storage using IndexedDB.
 * Stores normalized binary image Blobs locally without polluting localStorage.
 */

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

const DB_NAME = 'nfcweb_photo_assets_db';
const DB_VERSION = 1;
const STORE_NAME = 'photo_assets';

let dbPromise: Promise<IDBDatabase> | null = null;

function getDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Failed to open photo asset IndexedDB database'));
    };

    request.onblocked = () => {
      console.warn('IndexedDB database open was blocked by an older connection');
    };
  });

  return dbPromise;
}

/**
 * Generate a unique asset ID
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
  const db = await getDB();
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
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => {
        resolve(id);
      };

      req.onerror = () => {
        reject(req.error || new Error('Failed to save photo asset to IndexedDB'));
      };

      tx.onerror = () => {
        reject(tx.error || new Error('Transaction failed while saving photo asset'));
      };
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
    const db = await getDB();
    return new Promise<StoredPhotoAsset | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
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
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(assetId);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error(`Failed to delete photo asset ${assetId}`));
    });
  } catch (err) {
    console.warn('Error deleting photo asset from IndexedDB:', err);
  }
}

/**
 * Delete multiple photo assets by ID
 */
export async function deletePhotoAssets(assetIds: string[]): Promise<void> {
  if (!assetIds || assetIds.length === 0) return;
  try {
    const db = await getDB();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      let pending = assetIds.length;
      let hasError = false;

      for (const id of assetIds) {
        if (!id) {
          pending--;
          if (pending === 0) resolve();
          continue;
        }
        const req = store.delete(id);
        req.onsuccess = () => {
          pending--;
          if (pending === 0 && !hasError) resolve();
        };
        req.onerror = (e) => {
          hasError = true;
          reject(req.error || new Error(`Failed to delete asset ${id}`));
        };
      }
    });
  } catch (err) {
    console.warn('Error batch deleting photo assets from IndexedDB:', err);
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

  // If in environment without browser Image/Canvas (e.g., node / headless), store directly
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    return {
      blob: fileOrBlob,
      width: 0,
      height: 0,
      mimeType: fileOrBlob.type || 'image/jpeg'
    };
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const objectUrl = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(fileOrBlob) : '';
    const img = new Image();

    // Timeout safety fallback for environments where Image.onload is not implemented (e.g., jsdom)
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        if (objectUrl) {
          try { URL.revokeObjectURL(objectUrl); } catch (_) {}
        }
        resolve({
          blob: fileOrBlob,
          width: 0,
          height: 0,
          mimeType: fileOrBlob.type || 'image/jpeg'
        });
      }
    }, 150);

    img.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      }

      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback: store original blob
        resolve({
          blob: fileOrBlob,
          width,
          height,
          mimeType: fileOrBlob.type || 'image/jpeg'
        });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Prefer image/webp if supported, or image/jpeg
      const outputType = fileOrBlob.type === 'image/png' ? 'image/png' : 'image/jpeg';

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({
              blob,
              width,
              height,
              mimeType: outputType
            });
          } else {
            resolve({
              blob: fileOrBlob,
              width,
              height,
              mimeType: fileOrBlob.type || 'image/jpeg'
            });
          }
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
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
