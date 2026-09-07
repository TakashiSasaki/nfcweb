import { NFCTagItem, PhotoUpdate } from '../types';
import { canonicalizeUid } from '../domain/uid';
import { updateTagPhotoTransactional } from './transactionalOperations';
import { deletePhotoAsset } from './photoAssetStorage';

export interface ApplyTagPhotoUpdateOptions {
  tags: readonly NFCTagItem[];
  uid: string;
  update: PhotoUpdate;
  onCommit?: (persistedTags: NFCTagItem[]) => void;
}

export interface ApplyTagPhotoUpdateResult {
  success: boolean;
  persistedTags?: NFCTagItem[];
  error?: string;
}

/**
 * Executes an atomic cross-storage photo mutation for an NFC tag using the authoritative
 * `nfcweb_db` transactional layer.
 */
export async function applyTagPhotoUpdate(
  options: ApplyTagPhotoUpdateOptions
): Promise<ApplyTagPhotoUpdateResult> {
  const {
    tags,
    uid,
    update,
    onCommit
  } = options;

  const canon = canonicalizeUid(uid);
  if (!canon) {
    if (update.photoAssetId) {
      await deletePhotoAsset(update.photoAssetId).catch(() => {});
    }
    return { success: false, error: 'Invalid tag UID' };
  }

  const currentTag = tags.find(t => canonicalizeUid(t.uid) === canon);
  if (!currentTag) {
    if (update.photoAssetId) {
      await deletePhotoAsset(update.photoAssetId).catch(() => {});
    }
    return { success: false, error: `Tag with UID [${uid}] not found` };
  }

  const result = await updateTagPhotoTransactional(canon, update);
  if (!result.success) {
    if (update.photoAssetId) {
      await deletePhotoAsset(update.photoAssetId).catch(() => {});
    }
    return {
      success: false,
      error: result.error || 'Failed to update tag photo in IndexedDB'
    };
  }

  const updatedTag = result.tag || {
    ...currentTag,
    photoAssetId: update.photoAssetId === null ? undefined : (update.photoAssetId ?? currentTag.photoAssetId),
    photoUrl: update.photoUrl === null ? undefined : (update.photoUrl ?? currentTag.photoUrl)
  };

  const persistedTags = tags.map(t => canonicalizeUid(t.uid) === canon ? updatedTag : t);
  if (onCommit) {
    onCommit(persistedTags);
  }

  return {
    success: true,
    persistedTags
  };
}
