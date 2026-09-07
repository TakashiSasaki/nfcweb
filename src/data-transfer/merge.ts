// Compatibility re-export from authoritative src/data-format/import-plan
import { NFCTagItem } from '../types';
import {
  NfcwebTagRegistryExportV1,
  ExportableTagV1,
  ImportMode,
  ImportPlan
} from '../data-format/types';
import {
  convertExportableToLocal,
  areTagsEquivalent,
  buildImportPlan,
  applyImportPlan
} from '../data-format/import-plan';

export {
  convertExportableToLocal,
  areTagsEquivalent,
  buildImportPlan,
  applyImportPlan
};

/**
 * Adapter for previous calculatePreflightStats signature, delegating to buildImportPlan.
 */
export function calculatePreflightStats(
  importedDoc: NfcwebTagRegistryExportV1,
  localTags: readonly NFCTagItem[]
) {
  const plan = buildImportPlan(importedDoc, localTags, 'merge');
  return {
    totalImported: plan.importCount,
    newCount: plan.newCount,
    conflictCount: plan.updateCount,
    unchangedCount: plan.unchangedCount,
    currentLocalCount: plan.currentCount,
    resultingCount: plan.resultingCount,
    sampleCount: 0,
    diffs: plan.actions.map(a => ({
      uid: a.uid,
      normalizedUid: a.uid,
      status: a.status === 'update' ? 'update' : a.status,
      name: a.name,
      recordCount: a.recordCount
    }))
  };
}

/**
 * Adapter for applyMerge delegating to buildImportPlan + applyImportPlan.
 */
export function applyMerge(
  importedTags: readonly ExportableTagV1[],
  localTags: readonly NFCTagItem[]
): NFCTagItem[] {
  const doc: NfcwebTagRegistryExportV1 = {
    format: 'nfcweb-tag-registry',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    tags: [...importedTags]
  };
  const plan = buildImportPlan(doc, localTags, 'merge');
  return applyImportPlan(plan);
}

/**
 * Adapter for applyReplace delegating to buildImportPlan + applyImportPlan.
 */
export function applyReplace(importedTags: readonly ExportableTagV1[]): NFCTagItem[] {
  const doc: NfcwebTagRegistryExportV1 = {
    format: 'nfcweb-tag-registry',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    appVersion: '1.0.0',
    tags: [...importedTags]
  };
  const plan = buildImportPlan(doc, [], 'replace');
  return applyImportPlan(plan);
}
