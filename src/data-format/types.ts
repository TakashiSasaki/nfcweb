import {
  NFCWebTagRegistryInterchangeSchema,
  ExportableTagV1,
  NdefRecord,
  TextRecord,
  UrlRecord,
  MimeRecord,
  EmptyRecord
} from './generated/nfcweb-tag-registry';
import { NFCTagItem } from '../types';

export const CANONICAL_FORMAT = 'nfcweb-tag-registry' as const;
export const CANONICAL_SCHEMA_VERSION = 1 as const;
export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB threshold

// Type alias matching domain naming
export type NfcwebTagRegistryExportV1 = NFCWebTagRegistryInterchangeSchema;
export type TagRegistryExportDocumentV1 = NfcwebTagRegistryExportV1;

export type {
  ExportableTagV1,
  NdefRecord,
  TextRecord,
  UrlRecord,
  MimeRecord,
  EmptyRecord
};

export interface ImportValidationError {
  path: string;
  message: string;
  keyword?: string;
}

export interface ImportValidationResult {
  ok: boolean;
  document?: NfcwebTagRegistryExportV1;
  errors?: ImportValidationError[];
}

export type ImportMode = 'merge' | 'replace';
export type ImportTagActionStatus = 'new' | 'update' | 'unchanged' | 'remove';

export interface ImportPlanTagAction {
  uid: string; // canonical UID
  status: ImportTagActionStatus;
  name?: string;
  recordCount: number;
  localTag?: NFCTagItem;
  importedTag?: ExportableTagV1;
}

export interface ImportPlan {
  mode: ImportMode;
  currentCount: number;
  importCount: number;
  newCount: number;
  updateCount: number;
  unchangedCount: number;
  removedCount: number;
  resultingCount: number;
  actions: ImportPlanTagAction[];
  resultingTags: NFCTagItem[];
}
