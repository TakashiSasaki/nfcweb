/**
 * Tag Registry Storage Bridge.
 * Re-exports asynchronous tag repository methods backed by unified `nfcweb_db`,
 * while providing synchronized helpers for existing components during transition.
 */

import { NFCTagItem } from '../types';
import { canonicalizeUid } from '../domain/uid';
import {
  getAllTags,
  getTagByUid,
  saveTag,
  saveAllTags,
  deleteTag,
  deleteTags,
  clearAllTags,
  replaceTagRegistry,
  countTags,
  sanitizeTag
} from './tagRepository';

export {
  getAllTags,
  getTagByUid,
  saveTag,
  saveAllTags,
  deleteTag,
  deleteTags,
  clearAllTags,
  replaceTagRegistry,
  countTags,
  sanitizeTag
};

export const TAGS_STORAGE_KEY = 'nfc_tags_registry';
export const STORAGE_KEY_TAG_REGISTRY = TAGS_STORAGE_KEY;

export interface StorageOperationResult {
  success: boolean;
  error?: string;
}

/**
 * Async loader for tag registry from authoritative IndexedDB.
 */
export async function loadTagRegistryAsync(): Promise<NFCTagItem[]> {
  try {
    return await getAllTags();
  } catch (err) {
    console.error('Failed to load tag registry from IndexedDB:', err);
    return [];
  }
}

/**
 * Loads tags synchronously from legacy localStorage if available (used for fallback).
 */
export function loadTagRegistry(): NFCTagItem[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TAGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map(t => sanitizeTag(t))
        .sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
    }
  } catch (err) {
    console.error('Failed to load tag registry from localStorage fallback:', err);
  }
  return [];
}

/**
 * Persists tags asynchronously to IndexedDB.
 */
export async function saveTagRegistryAsync(tags: readonly NFCTagItem[]): Promise<StorageOperationResult> {
  try {
    await replaceTagRegistry(tags);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to persist tag registry to IndexedDB:', err);
    return { success: false, error: err?.message || 'Failed to save tags to IndexedDB' };
  }
}

/**
 * Synchronous saveTagRegistry helper for backward compatibility with existing tests.
 */
export function saveTagRegistry(tags: readonly NFCTagItem[]): StorageOperationResult {
  if (typeof localStorage === 'undefined') {
    return { success: false, error: 'Storage is not available.' };
  }
  try {
    const sanitized = tags.map(sanitizeTag);
    localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(sanitized));
    // Asynchronously update IndexedDB as well
    replaceTagRegistry(sanitized).catch(() => {});
    return { success: true };
  } catch (err: any) {
    const message = err?.name === 'QuotaExceededError'
      ? 'Storage quota exceeded (QuotaExceededError). Please free up local space.'
      : (err?.message || 'Failed to persist tag registry to local storage.');
    return { success: false, error: message };
  }
}

/**
 * Commits tag registry and invokes state update on success.
 */
export function commitTagRegistry(
  tags: readonly NFCTagItem[],
  applyStateUpdate?: (persistedTags: NFCTagItem[]) => void
): StorageOperationResult {
  const result = saveTagRegistry(tags);
  if (result.success) {
    if (applyStateUpdate) {
      applyStateUpdate(tags.map(sanitizeTag).sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0)));
    }
  }
  return result;
}

/**
 * Clears tag registry from storage.
 */
export function clearTagRegistry(): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(TAGS_STORAGE_KEY);
    } catch (_) {}
  }
  clearAllTags().catch(() => {});
}
