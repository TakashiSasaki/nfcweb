// Pure export construction and serialization logic
import { NFCTagItem, EditableNDEFRecord } from '../types';
import { 
  NfcwebTagRegistryExportV1, 
  ExportableTagV1, 
  ExportableNDEFRecordV1, 
  CANONICAL_FORMAT, 
  CANONICAL_SCHEMA_VERSION 
} from './types';

/**
 * Reconstructs a clean, canonical v1 transport document from local NFCTagItem entities.
 * Only whitelisted schema fields are emitted; arbitrary runtime or localStorage properties are omitted.
 */
export function buildTagRegistryExportV1(
  tags: readonly NFCTagItem[], 
  appVersion: string, 
  exportedAtDate: Date = new Date()
): NfcwebTagRegistryExportV1 {
  const sanitizedTags: ExportableTagV1[] = tags.map(tag => {
    const records: ExportableNDEFRecordV1[] = (tag.records || []).map(r => {
      const rec: ExportableNDEFRecordV1 = {
        id: String(r.id || `rec-${Date.now()}`),
        recordType: (['text', 'url', 'mime', 'empty'].includes(r.recordType) ? r.recordType : 'empty') as ExportableNDEFRecordV1['recordType'],
        data: String(r.data ?? '')
      };
      if (r.mediaType !== undefined && r.mediaType !== null) {
        rec.mediaType = String(r.mediaType);
      }
      if (r.lang !== undefined && r.lang !== null) {
        rec.lang = String(r.lang);
      }
      if (r.encoding !== undefined && r.encoding !== null) {
        rec.encoding = String(r.encoding);
      }
      return rec;
    });

    const item: ExportableTagV1 = {
      uid: String(tag.uid).trim(),
      firstSeen: typeof tag.firstSeen === 'number' && tag.firstSeen >= 0 ? Math.floor(tag.firstSeen) : Date.now(),
      lastRead: typeof tag.lastRead === 'number' && tag.lastRead >= 0 ? Math.floor(tag.lastRead) : Date.now(),
      readCount: typeof tag.readCount === 'number' && tag.readCount >= 0 ? Math.floor(tag.readCount) : 1,
      hasNdef: Boolean(tag.hasNdef),
      records
    };

    if (tag.name !== undefined && tag.name !== null && String(tag.name).trim() !== '') {
      item.name = String(tag.name).trim();
    }
    if (tag.lastAction && ['read', 'write', 'erase'].includes(tag.lastAction)) {
      item.lastAction = tag.lastAction;
    }
    if (tag.tagType !== undefined && tag.tagType !== null && String(tag.tagType).trim() !== '') {
      item.tagType = String(tag.tagType).trim();
    }
    if (tag.notes !== undefined && tag.notes !== null && String(tag.notes).trim() !== '') {
      item.notes = String(tag.notes);
    }
    if (typeof tag.isSample === 'boolean') {
      item.isSample = tag.isSample;
    }

    return item;
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
 * Serializes the export object with 2-space pretty printing.
 */
export function serializeExportDocument(doc: NfcwebTagRegistryExportV1): string {
  return JSON.stringify(doc, null, 2);
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
    // Delay revocation to ensure browser download mechanism consumes the blob
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }
}
