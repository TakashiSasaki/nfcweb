import { NFCTagItem, PhotoUpdate } from '../types';
import { canonicalizeUid } from '../domain/uid';
import { commitTagRegistry, StorageOperationResult } from './tagRegistryStorage';
import { deletePhotoAsset } from './photoAssetStorage';

export interface ApplyTagPhotoUpdateOptions {
  tags: readonly NFCTagItem[];
  uid: string;
  update: PhotoUpdate;
  commitRegistry?: (
    candidateTags: readonly NFCTagItem[],
    applyStateUpdate?: (persisted: NFCTagItem[]) => void
  ) => Promise<StorageOperationResult> | StorageOperationResult;
  deletePhotoAssetFn?: (assetId: string) => Promise<void>;
  onCommit?: (persistedTags: NFCTagItem[]) => void;
}

export interface ApplyTagPhotoUpdateResult {
  success: boolean;
  persistedTags?: NFCTagItem[];
  error?: string;
}

/**
 * Executes an atomic cross-storage photo mutation for an NFC tag.
 *
 * Semantic rules for PhotoUpdate:
 * - update.photoAssetId:
 *     - undefined (omitted): retain existing photoAssetId
 *     - null: explicitly clear photoAssetId
 *     - string: set new photoAssetId
 * - update.photoUrl:
 *     - undefined (omitted): retain existing photoUrl
 *     - null: explicitly clear photoUrl
 *     - string: set new photoUrl
 *
 * Effective Asset ID and Cleanup rules:
 * - effectiveAssetId is the calculated asset ID for the candidate state.
 * - If registry persistence fails, any newly provided asset candidate is rolled back (deleted).
 * - Only after successful durable registry commit, if oldAssetId exists and differs from effectiveAssetId,
 *   the old asset is deleted from IndexedDB.
 */
export async function applyTagPhotoUpdate(
  options: ApplyTagPhotoUpdateOptions
): Promise<ApplyTagPhotoUpdateResult> {
  const {
    tags,
    uid,
    update,
    commitRegistry = commitTagRegistry,
    deletePhotoAssetFn = deletePhotoAsset,
    onCommit
  } = options;

  const canon = canonicalizeUid(uid);
  if (!canon) {
    return { success: false, error: 'Invalid tag UID' };
  }

  const currentTag = tags.find(t => canonicalizeUid(t.uid) === canon);
  if (!currentTag) {
    // If a new photo asset candidate was uploaded, roll it back
    if (typeof update.photoAssetId === 'string' && update.photoAssetId) {
      await deletePhotoAssetFn(update.photoAssetId).catch(() => {});
    }
    return { success: false, error: `Tag with UID [${uid}] not found` };
  }

  const oldAssetId = currentTag.photoAssetId;

  // Calculate effective asset ID according to PhotoUpdate contract:
  // - undefined: preserve oldAssetId
  // - null: undefined (cleared)
  // - string: new asset ID
  const effectiveAssetId: string | undefined =
    update.photoAssetId === undefined
      ? oldAssetId
      : update.photoAssetId === null
        ? undefined
        : update.photoAssetId;

  const isNewAssetProvided =
    typeof update.photoAssetId === 'string' &&
    Boolean(update.photoAssetId) &&
    update.photoAssetId !== oldAssetId;

  // Construct candidate registry with explicit photo updates
  const candidateTags: NFCTagItem[] = tags.map(t => {
    if (canonicalizeUid(t.uid) === canon) {
      const next: NFCTagItem = { ...t };

      if (update.photoAssetId !== undefined) {
        if (update.photoAssetId === null) {
          delete next.photoAssetId;
        } else {
          next.photoAssetId = update.photoAssetId;
        }
      }

      if (update.photoUrl !== undefined) {
        if (update.photoUrl === null) {
          delete next.photoUrl;
        } else {
          next.photoUrl = update.photoUrl;
        }
      }

      return next;
    }
    return t;
  });

  let committedTags: NFCTagItem[] | undefined;
  const commitResult = await commitRegistry(candidateTags, (persisted) => {
    committedTags = persisted;
    if (onCommit) {
      onCommit(persisted);
    }
  });

  if (!commitResult.success) {
    // Rollback newly created asset candidate on persistence failure
    if (isNewAssetProvided && update.photoAssetId) {
      await deletePhotoAssetFn(update.photoAssetId).catch(() => {});
    }
    return {
      success: false,
      error: commitResult.error || 'Failed to persist tag photo metadata'
    };
  }

  // Durable registry commit succeeded.
  // Clean up old asset ONLY if oldAssetId exists and effectiveAssetId differs from oldAssetId
  if (oldAssetId && oldAssetId !== effectiveAssetId) {
    deletePhotoAssetFn(oldAssetId).catch(err => {
      console.warn('Failed to clean up old photo asset from IndexedDB:', err);
    });
  }

  return {
    success: true,
    persistedTags: committedTags ?? candidateTags
  };
}
