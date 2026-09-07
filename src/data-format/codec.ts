// Canonical export construction, serialization, and download utilities
import { NFCTagItem, EditableNDEFRecord } from '../types';
import {
  NfcwebTagRegistryExportV1,
  ExportableTagV1,
  NdefRecord,
  CANONICAL_FORMAT,
  CANONICAL_SCHEMA_VERSION
} from './types';
import { canonicalizeUid } from '../domain/uid';
import { validateImportPayload } from './validate';

/**
 * Reconstructs a clean, canonical v1 transport document from local NFCTagItem entities.
 * Only properties defined in the canonical schema are emitted.
 * - UIDs are formatted to canonical lowercase hex.
 * - 'isSample' development-only flag is strictly excluded from public export.
 * - Records are mapped to discriminated NDEF record types.
 */
export function buildTagRegistryExportV1(
  tags: readonly NFCTagItem[],
  appVersion: string,
  exportedAtDate: Date = new Date()
): NfcwebTagRegistryExportV1 {
  const sanitizedTags: ExportableTagV1[] = tags.map(tag => {
    const records: NdefRecord[] = (tag.records || []).map(r => {
      const id = String(r.id || `rec-${Date.now()}`);
      const data = String(r.data ?? '');

      switch (r.recordType) {
        case 'text':
          return {
            id,
            recordType: 'text' as const,
            data,
            ...(r.lang ? { lang: String(r.lang) } : {}),
            ...(r.encoding ? { encoding: String(r.encoding) } : {})
          };

        case 'url':
          return {
            id,
            recordType: 'url' as const,
            data
          };

        case 'mime':
          return {
            id,
            recordType: 'mime' as const,
            data,
            mediaType: String(r.mediaType || 'application/octet-stream')
          };

        case 'empty':
        default:
          return {
            id,
            recordType: 'empty' as const,
            data: ''
          };
      }
    });

    const canonicalUid = canonicalizeUid(tag.uid);
    const rawFirstSeen = typeof tag.firstSeen === 'number' && tag.firstSeen >= 0 ? Math.floor(tag.firstSeen) : Date.now();
    const rawLastRead = typeof tag.lastRead === 'number' && tag.lastRead >= 0 ? Math.floor(tag.lastRead) : Date.now();

    // Enforce invariant: firstSeen <= lastRead
    const lastRead = Math.max(rawFirstSeen, rawLastRead);
    const firstSeen = Math.min(rawFirstSeen, lastRead);

    const exportTag: ExportableTagV1 = {
      uid: canonicalUid,
      firstSeen,
      lastRead,
      readCount: typeof tag.readCount === 'number' && tag.readCount >= 0 ? Math.floor(tag.readCount) : 1,
      hasNdef: Boolean(tag.hasNdef),
      records
    };

    if (tag.name !== undefined && tag.name !== null && String(tag.name).trim() !== '') {
      exportTag.name = String(tag.name).trim();
    }
    if (tag.lastAction && ['read', 'write', 'erase'].includes(tag.lastAction)) {
      exportTag.lastAction = tag.lastAction;
    }
    if (tag.tagType !== undefined && tag.tagType !== null && String(tag.tagType).trim() !== '') {
      exportTag.tagType = String(tag.tagType).trim();
    }
    if (tag.notes !== undefined && tag.notes !== null && String(tag.notes).trim() !== '') {
      exportTag.notes = String(tag.notes);
    }

    return exportTag;
  });

  return {
    format: CANONICAL_FORMAT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    exportedAt: exportedAtDate.toISOString(),
    appVersion: appVersion || '1.0.0',
    tags: sanitizedTags
  };
}

/**
 * Serializes the canonical export document with standard 2-space UTF-8 JSON indentation.
 */
export function serializeExportDocument(doc: NfcwebTagRegistryExportV1): string {
  return JSON.stringify(doc, null, 2);
}

/**
 * Parses and validates an exported JSON string into a canonical document.
 * Throws an Error if parsing or schema validation fails.
 */
export function deserializeExportDocument(jsonContent: string): NfcwebTagRegistryExportV1 {
  const parsed = JSON.parse(jsonContent);
  const result = validateImportPayload(parsed);
  if (!result.ok || !result.document) {
    const msg = result.errors?.map(e => `${e.path}: ${e.message}`).join(', ') || 'Validation error';
    throw new Error(`Failed to deserialize canonical document: ${msg}`);
  }
  return result.document;
}

/**
 * Formats a deterministic timestamped filename: nfcweb-tags-v1-YYYYMMDD-HHmmss.json
 */
export function generateExportFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const DD = pad(date.getDate());
  const HH = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `nfcweb-tags-v1-${YYYY}${MM}${DD}-${HH}${mm}${ss}.json`;
}

/**
 * Triggers a UTF-8 browser download for a JSON string with safe URL revocation.
 */
export function downloadJsonFile(filename: string, jsonContent: string): void {
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
}
