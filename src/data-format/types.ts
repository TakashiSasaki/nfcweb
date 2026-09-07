import {
  NfcTagRegistryV1,
  NfcTagV1,
  NdefRecordV1,
  TextRecordV1,
  UrlRecordV1,
  MimeRecordV1,
  EmptyRecordV1,
  NFCWebTagRegistryInterchangeSchema,
  ExportableTagV1,
  NdefRecord,
  TextRecord,
  UrlRecord,
  MimeRecord,
  EmptyRecord
} from './generated/nfcweb-tag-registry';
import { NFCTagItem } from '../types';
import nfcTagRegistrySchema from './schemas/nfc-tag-registry.schema.json';
import nfcTagSchema from './schemas/nfc-tag.schema.json';

// Authoritative contract metadata derived directly from Canonical JSON Schemas (Draft 2020-12)
export const CANONICAL_FORMAT: NfcTagRegistryV1['format'] = nfcTagRegistrySchema.properties.format.const as NfcTagRegistryV1['format'];
export const CANONICAL_SCHEMA_VERSION: NfcTagRegistryV1['schemaVersion'] = nfcTagRegistrySchema.properties.schemaVersion.const as NfcTagRegistryV1['schemaVersion'];
export const CANONICAL_UID_PATTERN: string = nfcTagSchema.properties.uid.pattern;
export const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MiB threshold

// Type aliases matching domain and specification naming
export type {
  NfcTagRegistryV1,
  NfcTagV1,
  NdefRecordV1,
  TextRecordV1,
  UrlRecordV1,
  MimeRecordV1,
  EmptyRecordV1,
  NFCWebTagRegistryInterchangeSchema,
  ExportableTagV1,
  NdefRecord,
  TextRecord,
  UrlRecord,
  MimeRecord,
  EmptyRecord
};

export type NfcwebTagRegistryExportV1 = NfcTagRegistryV1;
export type TagRegistryExportDocumentV1 = NfcTagRegistryV1;

export interface ImportValidationError {
  path: string;
  message: string;
  keyword?: string;
}

export interface ImportValidationResult {
  ok: boolean;
  document?: NfcTagRegistryV1;
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
  importedTag?: NfcTagV1;
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
