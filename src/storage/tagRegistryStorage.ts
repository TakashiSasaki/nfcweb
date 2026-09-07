/**
 * Tag Registry Storage Bridge.
 * Re-exports asynchronous tag repository methods backed by unified `nfcweb_db`.
 */

import { NFCTagItem } from '../types';
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
import {
  deleteTagTransactional,
  clearAllTagsTransactional,
  importRegistryTransactional,
  replaceTagRegistryTransactional,
  updateTagPhotoTransactional
} from './transactionalOperations';

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
  sanitizeTag,
  deleteTagTransactional,
  clearAllTagsTransactional,
  importRegistryTransactional,
  replaceTagRegistryTransactional,
  updateTagPhotoTransactional
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
 * Loads tags synchronously from legacy localStorage if available (used strictly for migration fallback).
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
 * Persists tags asynchronously to authoritative IndexedDB.
 */
export async function saveTagRegistryAsync(tags: readonly NFCTagItem[]): Promise<StorageOperationResult> {
  try {
    return await replaceTagRegistryTransactional(tags);
  } catch (err: any) {
    console.error('Failed to persist tag registry to IndexedDB:', err);
    return { success: false, error: err?.message || 'Failed to save tags to IndexedDB' };
  }
}

/**
 * Persists tags to IndexedDB (asynchronously updates DB without writing to localStorage).
 */
export function saveTagRegistry(tags: readonly NFCTagItem[]): StorageOperationResult {
  const sanitized = tags.map(sanitizeTag);
  replaceTagRegistryTransactional(sanitized).catch(err => {
    console.warn('Failed async tag registry commit:', err);
  });
  return { success: true };
}

/**
 * Commits tag registry and invokes state update on success.
 */
export function commitTagRegistry(
  tags: readonly NFCTagItem[],
  applyStateUpdate?: (persistedTags: NFCTagItem[]) => void
): StorageOperationResult {
  const result = saveTagRegistry(tags);
  if (result.success && applyStateUpdate) {
    applyStateUpdate(tags.map(sanitizeTag).sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0)));
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
  clearAllTagsTransactional().catch(() => {});
}
