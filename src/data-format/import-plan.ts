// Unified Import Plan calculation and mutation for Merge and Replace
import { NFCTagItem, EditableNDEFRecord } from '../types';
import {
  NfcwebTagRegistryExportV1,
  ExportableTagV1,
  NdefRecord,
  TextRecord,
  MimeRecord,
  ImportMode,
  ImportPlan,
  ImportPlanTagAction
} from './types';
import { canonicalizeUid } from '../domain/uid';

/**
 * Converts a validated canonical transport tag object into an internal NFCTagItem entity.
 */
export function convertExportableToLocal(tag: ExportableTagV1): NFCTagItem {
  const records: EditableNDEFRecord[] = (tag.records || []).map(r => ({
    id: r.id,
    recordType: r.recordType,
    data: r.data ?? '',
    ...(r.recordType === 'mime' && (r as MimeRecord).mediaType ? { mediaType: (r as MimeRecord).mediaType } : {}),
    ...(r.recordType === 'text' && (r as TextRecord).lang ? { lang: (r as TextRecord).lang } : {}),
    ...(r.recordType === 'text' && (r as TextRecord).encoding ? { encoding: (r as TextRecord).encoding } : {})
  }));

  const localItem: NFCTagItem = {
    uid: canonicalizeUid(tag.uid),
    firstSeen: tag.firstSeen,
    lastRead: tag.lastRead,
    readCount: tag.readCount,
    hasNdef: tag.hasNdef,
    records,
    ...(tag.name ? { name: tag.name } : {}),
    ...(tag.lastAction ? { lastAction: tag.lastAction } : {}),
    ...(tag.tagType ? { tagType: tag.tagType } : {}),
    ...(tag.notes ? { notes: tag.notes } : {})
  };

  return localItem;
}

/**
 * Checks if an imported tag is functionally identical to an existing local tag.
 * Evaluates all canonical fields including NDEF record IDs and all attributes.
 */
export function areTagsEquivalent(imported: ExportableTagV1, local: NFCTagItem): boolean {
  if (canonicalizeUid(imported.uid) !== canonicalizeUid(local.uid)) return false;
  if ((imported.name || '') !== (local.name || '')) return false;
  if (imported.firstSeen !== local.firstSeen) return false;
  if (imported.lastRead !== local.lastRead) return false;
  if (imported.readCount !== local.readCount) return false;
  if ((imported.lastAction || '') !== (local.lastAction || '')) return false;
  if ((imported.tagType || '') !== (local.tagType || '')) return false;
  if (imported.hasNdef !== local.hasNdef) return false;
  if ((imported.notes || '') !== (local.notes || '')) return false;

  const impRecs: readonly NdefRecord[] = imported.records || [];
  const locRecs: readonly EditableNDEFRecord[] = local.records || [];
  if (impRecs.length !== locRecs.length) return false;

  for (let i = 0; i < impRecs.length; i++) {
    const ir = impRecs[i];
    const lr = locRecs[i];
    // Record ID comparison (ensures changes to record id are detected)
    if (ir.id !== lr.id) return false;
    if (ir.recordType !== lr.recordType) return false;
    if ((ir.data ?? '') !== (lr.data ?? '')) return false;

    const irMediaType = ir.recordType === 'mime' ? (ir as MimeRecord).mediaType || '' : '';
    const lrMediaType = lr.mediaType || '';
    if (irMediaType !== lrMediaType) return false;

    const irLang = ir.recordType === 'text' ? (ir as TextRecord).lang || '' : '';
    const lrLang = lr.lang || '';
    if (irLang !== lrLang) return false;

    const irEncoding = ir.recordType === 'text' ? (ir as TextRecord).encoding || '' : '';
    const lrEncoding = lr.encoding || '';
    if (irEncoding !== lrEncoding) return false;
  }

  return true;
}

/**
 * Constructs a deterministic Import Plan from the validated document and current registry.
 * Derives exact counts, per-tag actions, and precomputed resulting tags.
 */
export function buildImportPlan(
  importedDoc: NfcwebTagRegistryExportV1,
  currentRegistry: readonly NFCTagItem[],
  mode: ImportMode
): ImportPlan {
  const localMap = new Map<string, NFCTagItem>();
  for (const local of currentRegistry) {
    const canonUid = canonicalizeUid(local.uid);
    if (canonUid) {
      localMap.set(canonUid, local);
    }
  }

  const actions: ImportPlanTagAction[] = [];
  const importedUids = new Set<string>();

  let newCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;

  for (const imp of importedDoc.tags) {
    const canonUid = canonicalizeUid(imp.uid);
    importedUids.add(canonUid);
    const existing = localMap.get(canonUid);

    if (!existing) {
      newCount++;
      actions.push({
        uid: canonUid,
        status: 'new',
        name: imp.name,
        recordCount: imp.records.length,
        importedTag: imp
      });
    } else {
      const isIdentical = areTagsEquivalent(imp, existing);
      if (isIdentical) {
        unchangedCount++;
        actions.push({
          uid: canonUid,
          status: 'unchanged',
          name: imp.name,
          recordCount: imp.records.length,
          localTag: existing,
          importedTag: imp
        });
      } else {
        updateCount++;
        actions.push({
          uid: canonUid,
          status: 'update',
          name: imp.name,
          recordCount: imp.records.length,
          localTag: existing,
          importedTag: imp
        });
      }
    }
  }

  let removedCount = 0;
  let resultingTags: NFCTagItem[] = [];

  if (mode === 'merge') {
    // Merge semantics:
    // - New tags added
    // - Existing matching tags replaced by imported tags (imported wins)
    // - Untouched local tags preserved
    const mergedList: NFCTagItem[] = [];
    const handledUids = new Set<string>();

    for (const imp of importedDoc.tags) {
      const canonUid = canonicalizeUid(imp.uid);
      mergedList.push(convertExportableToLocal(imp));
      handledUids.add(canonUid);
    }

    for (const local of currentRegistry) {
      const canonUid = canonicalizeUid(local.uid);
      if (!handledUids.has(canonUid)) {
        mergedList.push({ ...local });
      }
    }

    resultingTags = mergedList.sort((a, b) => b.lastRead - a.lastRead);
  } else {
    // Replace semantics:
    // - Entire local registry replaced with imported tags
    // - Local tags not present in import document are removed
    for (const local of currentRegistry) {
      const canonUid = canonicalizeUid(local.uid);
      if (!importedUids.has(canonUid)) {
        removedCount++;
        actions.push({
          uid: canonUid,
          status: 'remove',
          name: local.name,
          recordCount: local.records.length,
          localTag: local
        });
      }
    }

    resultingTags = importedDoc.tags
      .map(convertExportableToLocal)
      .sort((a, b) => b.lastRead - a.lastRead);
  }

  return {
    mode,
    currentCount: currentRegistry.length,
    importCount: importedDoc.tags.length,
    newCount,
    updateCount,
    unchangedCount,
    removedCount,
    resultingCount: resultingTags.length,
    actions,
    resultingTags
  };
}

/**
 * Applies an Import Plan.
 * Returns the exact precomputed resulting tags list derived during plan construction.
 */
export function applyImportPlan(plan: ImportPlan): NFCTagItem[] {
  return [...plan.resultingTags];
}
