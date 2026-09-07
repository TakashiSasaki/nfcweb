// Deterministic merge, replace, and preflight calculations for NFC Tag Registry
import { NFCTagItem, EditableNDEFRecord } from '../types';
import { 
  NfcwebTagRegistryExportV1, 
  ExportableTagV1, 
  ImportPreflightStats, 
  PreflightTagDiff 
} from './types';
import { normalizeUid } from '../store';

/**
 * Converts a validated transport tag object into an internal NFCTagItem model.
 */
export function convertExportableToLocal(tag: ExportableTagV1): NFCTagItem {
  const records: EditableNDEFRecord[] = (tag.records || []).map(r => ({
    id: r.id,
    recordType: r.recordType,
    data: r.data,
    ...(r.mediaType ? { mediaType: r.mediaType } : {}),
    ...(r.lang ? { lang: r.lang } : {}),
    ...(r.encoding ? { encoding: r.encoding } : {})
  }));

  const localItem: NFCTagItem = {
    uid: tag.uid,
    firstSeen: tag.firstSeen,
    lastRead: tag.lastRead,
    readCount: tag.readCount,
    hasNdef: tag.hasNdef,
    records,
    ...(tag.name ? { name: tag.name } : {}),
    ...(tag.lastAction ? { lastAction: tag.lastAction } : {}),
    ...(tag.tagType ? { tagType: tag.tagType } : {}),
    ...(tag.notes ? { notes: tag.notes } : {}),
    ...(typeof tag.isSample === 'boolean' ? { isSample: tag.isSample } : {})
  };

  return localItem;
}

/**
 * Checks if an imported tag is functionally identical to an existing local tag.
 */
function areTagsEquivalent(imported: ExportableTagV1, local: NFCTagItem): boolean {
  if ((imported.name || '') !== (local.name || '')) return false;
  if (imported.firstSeen !== local.firstSeen) return false;
  if (imported.lastRead !== local.lastRead) return false;
  if (imported.readCount !== local.readCount) return false;
  if ((imported.lastAction || '') !== (local.lastAction || '')) return false;
  if ((imported.tagType || '') !== (local.tagType || '')) return false;
  if (imported.hasNdef !== local.hasNdef) return false;
  if ((imported.notes || '') !== (local.notes || '')) return false;
  if (Boolean(imported.isSample) !== Boolean(local.isSample)) return false;

  const impRecs = imported.records || [];
  const locRecs = local.records || [];
  if (impRecs.length !== locRecs.length) return false;

  for (let i = 0; i < impRecs.length; i++) {
    const ir = impRecs[i];
    const lr = locRecs[i];
    if (ir.recordType !== lr.recordType) return false;
    if (ir.data !== lr.data) return false;
    if ((ir.mediaType || '') !== (lr.mediaType || '')) return false;
    if ((ir.lang || '') !== (lr.lang || '')) return false;
    if ((ir.encoding || '') !== (lr.encoding || '')) return false;
  }

  return true;
}

/**
 * Calculates preflight difference analysis without modifying any local state.
 */
export function calculatePreflightStats(
  importedDoc: NfcwebTagRegistryExportV1, 
  localTags: readonly NFCTagItem[]
): ImportPreflightStats {
  const localMap = new Map<string, NFCTagItem>();
  for (const t of localTags) {
    const norm = normalizeUid(t.uid);
    if (norm) localMap.set(norm, t);
  }

  let newCount = 0;
  let conflictCount = 0;
  let unchangedCount = 0;
  let sampleCount = 0;
  const diffs: PreflightTagDiff[] = [];

  for (const imp of importedDoc.tags) {
    const norm = normalizeUid(imp.uid);
    if (imp.isSample) sampleCount++;

    const existing = localMap.get(norm);
    if (!existing) {
      newCount++;
      diffs.push({
        uid: imp.uid,
        normalizedUid: norm,
        status: 'new',
        name: imp.name,
        recordCount: imp.records.length,
        isSample: imp.isSample
      });
    } else {
      const isIdentical = areTagsEquivalent(imp, existing);
      if (isIdentical) {
        unchangedCount++;
        diffs.push({
          uid: imp.uid,
          normalizedUid: norm,
          status: 'unchanged',
          name: imp.name,
          recordCount: imp.records.length,
          isSample: imp.isSample
        });
      } else {
        conflictCount++;
        diffs.push({
          uid: imp.uid,
          normalizedUid: norm,
          status: 'update',
          name: imp.name,
          recordCount: imp.records.length,
          isSample: imp.isSample
        });
      }
    }
  }

  return {
    totalImported: importedDoc.tags.length,
    newCount,
    conflictCount,
    unchangedCount,
    currentLocalCount: localTags.length,
    resultingCount: localTags.length + newCount,
    sampleCount,
    diffs
  };
}

/**
 * Executes a deterministic Merge:
 * - Imported UID not present locally is added.
 * - Imported UID already present locally replaces that registry record (imported data wins).
 * - Unaffected local UIDs remain untouched.
 * - Conflicting NDEF record arrays are NOT mixed/synthesized; imported tag records replace local.
 */
export function applyMerge(
  importedTags: readonly ExportableTagV1[], 
  localTags: readonly NFCTagItem[]
): NFCTagItem[] {
  // Map local items by normalized UID
  const localNormalizedMap = new Map<string, NFCTagItem>();
  for (const t of localTags) {
    const norm = normalizeUid(t.uid);
    if (norm) localNormalizedMap.set(norm, t);
  }

  const resultList: NFCTagItem[] = [];
  const handledLocalNorms = new Set<string>();

  // Process imported tags (imported-wins policy)
  for (const imp of importedTags) {
    const norm = normalizeUid(imp.uid);
    const converted = convertExportableToLocal(imp);
    resultList.push(converted);
    if (norm) handledLocalNorms.add(norm);
  }

  // Append remaining untouched local tags
  for (const local of localTags) {
    const norm = normalizeUid(local.uid);
    if (!handledLocalNorms.has(norm)) {
      resultList.push({ ...local });
    }
  }

  // Sort by lastRead DESC (most recently accessed at top)
  return resultList.sort((a, b) => b.lastRead - a.lastRead);
}

/**
 * Executes a deterministic Replace:
 * - Validated imported registry replaces the entire local registry.
 */
export function applyReplace(importedTags: readonly ExportableTagV1[]): NFCTagItem[] {
  const resultList = importedTags.map(convertExportableToLocal);
  return resultList.sort((a, b) => b.lastRead - a.lastRead);
}
