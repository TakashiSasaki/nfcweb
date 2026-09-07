import { NFCTagItem } from '../types';
import { canonicalizeUid } from '../domain/uid';

export const TAGS_STORAGE_KEY = 'nfc_tags_registry';
export const STORAGE_KEY_TAG_REGISTRY = TAGS_STORAGE_KEY;

export interface StorageOperationResult {
  success: boolean;
  error?: string;
}

function getStorage(): Storage | null {
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

/**
 * Loads and deserializes the tag registry from localStorage.
 * Automatically sorts by lastRead DESC (most recently read at top)
 * and guarantees canonical UIDs.
 */
export function loadTagRegistry(): NFCTagItem[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(TAGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map(t => ({
          ...t,
          uid: canonicalizeUid(t.uid)
        }))
        .sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
    }
  } catch (err) {
    console.error('Failed to load tag registry from localStorage:', err);
  }
  return [];
}

/**
 * Persists the tag registry to localStorage.
 * Enforces the safety property:
 * 1. Sanitizes and normalizes UIDs to canonical format.
 * 2. Serializes to JSON.
 * 3. Writes to localStorage.
 * 4. Catches QuotaExceededError or other write failures before updating caller state.
 */
export function saveTagRegistry(tags: readonly NFCTagItem[]): StorageOperationResult {
  const storage = getStorage();
  if (!storage) {
    return { success: false, error: 'Storage is not available.' };
  }
  try {
    const sanitized = tags.map(tag => ({
      ...tag,
      uid: canonicalizeUid(tag.uid)
    }));
    const serialized = JSON.stringify(sanitized);
    storage.setItem(TAGS_STORAGE_KEY, serialized);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to persist tag registry to localStorage:', err);
    const message = err?.name === 'QuotaExceededError'
      ? 'ブラウザのローカルストレージ容量上限 (QuotaExceededError) を超過しました。'
      : (err?.message || 'ローカルストレージへの書き込みに失敗しました。');
    return { success: false, error: message };
  }
}

/**
 * Atomically commits a tag registry to persistent storage and, ONLY IF successful,
 * invokes applyStateUpdate to update application/in-memory state.
 * If storage throws (e.g. QuotaExceededError), in-memory state remains untouched.
 */
export function commitTagRegistry(
  tags: readonly NFCTagItem[],
  applyStateUpdate?: (persistedTags: NFCTagItem[]) => void
): StorageOperationResult {
  const result = saveTagRegistry(tags);
  if (result.success) {
    if (applyStateUpdate) {
      applyStateUpdate(loadTagRegistry());
    }
  }
  return result;
}

/**
 * Clears tag registry from localStorage.
 */
export function clearTagRegistry(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(TAGS_STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear tag registry from localStorage:', err);
  }
}
