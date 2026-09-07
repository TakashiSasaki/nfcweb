// Canonical export construction, serialization, and download utilities
import { NFCTagItem, EditableNDEFRecord } from '../types';
import {
  NfcwebTagRegistryExportV1,
  ExportableTagV1,
  NdefRecord,
  CANONICAL_FORMAT,
  CANONICAL_SCHEMA_VERSION
} from './types';
import { canonicalizeUid, isValidCanonicalUid } from '../domain/uid';
import { validateImportPayload } from './validate';

/**
 * Reconstructs a clean, canonical v1 transport document from local NFCTagItem entities.
 * Only properties defined in the canonical schema are emitted.
 * - UIDs are verified against canonical validity rules.
 * - Invariant enforcement: rejects corrupted timestamps, missing record IDs, or missing MIME mediaTypes explicitly.
 * - 'isSample' development-only flag is strictly excluded from public export.
 * - Resulting export document is strictly verified against Canonical JSON Schema before return.
 */
export function buildTagRegistryExportV1(
  tags: readonly NFCTagItem[],
  appVersion: string,
  exportedAtDate: Date = new Date()
): NfcwebTagRegistryExportV1 {
  const sanitizedTags: ExportableTagV1[] = tags.map((tag, tagIndex) => {
    const canonicalUid = canonicalizeUid(tag.uid);
    if (!isValidCanonicalUid(canonicalUid)) {
      throw new Error(`Tag at index ${tagIndex} has invalid canonical UID: "${tag.uid}". UID must be 8-32 lowercase hexadecimal characters (even length).`);
    }

    if (typeof tag.firstSeen !== 'number' || !Number.isFinite(tag.firstSeen) || tag.firstSeen < 0) {
      throw new Error(`Tag "${canonicalUid}" has invalid firstSeen timestamp: ${tag.firstSeen}.`);
    }
    if (typeof tag.lastRead !== 'number' || !Number.isFinite(tag.lastRead) || tag.lastRead < 0) {
      throw new Error(`Tag "${canonicalUid}" has invalid lastRead timestamp: ${tag.lastRead}.`);
    }
    if (tag.firstSeen > tag.lastRead) {
      throw new Error(`Tag "${canonicalUid}" violates timestamp invariant: firstSeen (${tag.firstSeen}) must be <= lastRead (${tag.lastRead}).`);
    }
    if (typeof tag.readCount !== 'number' || !Number.isFinite(tag.readCount) || tag.readCount < 0) {
      throw new Error(`Tag "${canonicalUid}" has invalid readCount: ${tag.readCount}.`);
    }

    const records: NdefRecord[] = (tag.records || []).map((r, recIndex) => {
      if (!r.id || String(r.id).trim() === '') {
        throw new Error(`Tag "${canonicalUid}" record at index ${recIndex} is missing required id.`);
      }
      const id = String(r.id).trim();
      const data = String(r.data ?? '');

      switch (r.recordType) {
        case 'text':
          return {
            id,
            recordType: 'text' as const,
            data,
            ...(r.lang ? { lang: String(r.lang).trim() } : {}),
            ...(r.encoding ? { encoding: String(r.encoding).trim() } : {})
          };

        case 'url':
          return {
            id,
            recordType: 'url' as const,
            data
          };

        case 'mime': {
          if (!r.mediaType || String(r.mediaType).trim() === '') {
            throw new Error(`Tag "${canonicalUid}" MIME record "${id}" is missing required mediaType.`);
          }
          return {
            id,
            recordType: 'mime' as const,
            data,
            mediaType: String(r.mediaType).trim()
          };
        }

        case 'empty':
          return {
            id,
            recordType: 'empty' as const,
            data: ''
          };

        default:
          throw new Error(`Tag "${canonicalUid}" record "${id}" has unsupported recordType: "${(r as any).recordType}".`);
      }
    });

    const exportTag: ExportableTagV1 = {
      uid: canonicalUid,
      firstSeen: Math.floor(tag.firstSeen),
      lastRead: Math.floor(tag.lastRead),
      readCount: Math.floor(tag.readCount),
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

  const exportDoc: NfcwebTagRegistryExportV1 = {
    format: CANONICAL_FORMAT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    exportedAt: exportedAtDate.toISOString(),
    appVersion: appVersion || '1.0.0',
    tags: sanitizedTags
  };

  const validation = validateImportPayload(exportDoc);
  if (!validation.ok) {
    const detail = validation.errors?.map(e => `${e.path}: ${e.message}`).join(', ') || 'Schema validation failure';
    throw new Error(`Built export document failed canonical validation: ${detail}`);
  }

  return exportDoc;
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
