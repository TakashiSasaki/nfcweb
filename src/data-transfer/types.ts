// Public transport data contracts for NFC tag registry export/import
import { NFCTagItem, EditableNDEFRecord } from '../types';

export const CANONICAL_FORMAT = 'nfcweb-tag-registry' as const;
export const CANONICAL_SCHEMA_VERSION = 1 as const;
export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB safety threshold

export interface ExportableNDEFRecordV1 {
  id: string;
  recordType: 'text' | 'url' | 'mime' | 'empty';
  data: string;
  mediaType?: string;
  lang?: string;
  encoding?: string;
}

export interface ExportableTagV1 {
  uid: string;
  name?: string;
  firstSeen: number;
  lastRead: number;
  readCount: number;
  lastAction?: 'read' | 'write' | 'erase';
  tagType?: string;
  hasNdef: boolean;
  records: ExportableNDEFRecordV1[];
  notes?: string;
  isSample?: boolean;
}

export interface NfcwebTagRegistryExportV1 {
  format: typeof CANONICAL_FORMAT;
  schemaVersion: typeof CANONICAL_SCHEMA_VERSION;
  exportedAt: string;
  appVersion: string;
  tags: ExportableTagV1[];
}

export interface ImportValidationError {
  path: string;
  message: string;
  keyword?: string;
}

export interface ImportValidationResult {
  ok: boolean;
  document?: NfcwebTagRegistryExportV1;
  errors?: ImportValidationError[];
  isLegacy?: boolean;
  legacyWarning?: string;
}

export interface PreflightTagDiff {
  uid: string;
  normalizedUid: string;
  status: 'new' | 'update' | 'unchanged';
  name?: string;
  recordCount: number;
  isSample?: boolean;
}

export interface ImportPreflightStats {
  totalImported: number;
  newCount: number;
  conflictCount: number; // to be updated
  unchangedCount: number;
  currentLocalCount: number;
  resultingCount: number;
  sampleCount: number;
  diffs: PreflightTagDiff[];
}

export type ImportMode = 'merge' | 'replace';
