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
import registrySchema from './nfcweb-tag-registry.schema.json';

// Authoritative contract metadata derived directly from Canonical JSON Schema (Draft 2020-12)
export const CANONICAL_FORMAT: NFCWebTagRegistryInterchangeSchema['format'] = registrySchema.properties.format.const as NFCWebTagRegistryInterchangeSchema['format'];
export const CANONICAL_SCHEMA_VERSION: NFCWebTagRegistryInterchangeSchema['schemaVersion'] = registrySchema.properties.schemaVersion.const as NFCWebTagRegistryInterchangeSchema['schemaVersion'];
export const CANONICAL_UID_PATTERN: string = registrySchema.$defs.ExportableTagV1.properties.uid.pattern;
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
