// Schema and semantic validation for NFC Tag Registry import
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import registrySchema from './nfcweb-tag-registry.schema.json';
import { 
  CANONICAL_FORMAT, 
  CANONICAL_SCHEMA_VERSION, 
  MAX_IMPORT_FILE_SIZE_BYTES,
  NfcwebTagRegistryExportV1, 
  ImportValidationResult,
  ImportValidationError,
  ExportableTagV1,
  ExportableNDEFRecordV1
} from './types';
import { normalizeUid } from '../store';

// Initialize Ajv 2020 validator instance
// @ts-ignore - Handle ESM/CJS interop for Ajv2020 constructor
const AjvClass = (Ajv2020 as any).default || Ajv2020;
const ajv = new AjvClass({ 
  allErrors: true, 
  verbose: true,
  strict: false 
});

// @ts-ignore - Handle ESM/CJS interop for addFormats
const addFormatsFn = (addFormats as any).default || addFormats;
addFormatsFn(ajv);

const validateSchema = (ajv as any).compile(registrySchema);

export { registrySchema };

/**
 * Validates raw JSON string or parsed unknown payload against canonical v1 specification.
 */
export function validateImportPayload(input: unknown): ImportValidationResult {
  if (input === null || input === undefined) {
    return {
      ok: false,
      errors: [{ path: '#', message: 'Import payload is empty or undefined.' }]
    };
  }

  // Handle Legacy Unversioned Array Format [NFCTagItem, ...]
  if (Array.isArray(input)) {
    return validateLegacyArrayFormat(input);
  }

  if (typeof input !== 'object') {
    return {
      ok: false,
      errors: [{ path: '#', message: 'Expected JSON document to be an object.' }]
    };
  }

  const recordObj = input as Record<string, any>;

  // Check format identifier explicitly for actionable error reporting
  if (!('format' in recordObj)) {
    return {
      ok: false,
      errors: [{ path: '/format', message: `Missing required 'format' property. Expected "${CANONICAL_FORMAT}".` }]
    };
  }

  if (recordObj.format !== CANONICAL_FORMAT) {
    return {
      ok: false,
      errors: [{ path: '/format', message: `Unrecognized format "${String(recordObj.format)}". Expected "${CANONICAL_FORMAT}".` }]
    };
  }

  // Check schemaVersion explicitly for forward compatibility guidance
  if (!('schemaVersion' in recordObj)) {
    return {
      ok: false,
      errors: [{ path: '/schemaVersion', message: `Missing required 'schemaVersion' property. Expected ${CANONICAL_SCHEMA_VERSION}.` }]
    };
  }

  if (typeof recordObj.schemaVersion === 'number' && recordObj.schemaVersion > CANONICAL_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [{
        path: '/schemaVersion',
        message: `Unsupported future schema version (${recordObj.schemaVersion}). This version of NFCWeb supports schema version ${CANONICAL_SCHEMA_VERSION}. Please update the application.`
      }]
    };
  }

  if (recordObj.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [{
        path: '/schemaVersion',
        message: `Invalid schemaVersion (${String(recordObj.schemaVersion)}). Expected ${CANONICAL_SCHEMA_VERSION}.`
      }]
    };
  }

  // Validate structural schema using compiled JSON Schema
  const isSchemaValid = validateSchema(input);
  if (!isSchemaValid && validateSchema.errors) {
    const errors: ImportValidationError[] = validateSchema.errors.map(err => {
      const path = err.instancePath || (err.params as any)?.missingProperty ? `${err.instancePath}/${(err.params as any).missingProperty}` : '#';
      return {
        path: path.startsWith('/') ? path : `/${path}`,
        message: err.message ? `${err.message}${err.params ? ` (${JSON.stringify(err.params)})` : ''}` : 'Validation error',
        keyword: err.keyword
      };
    });
    return { ok: false, errors };
  }

  const validDoc = input as NfcwebTagRegistryExportV1;

  // Semantic Checks: Duplicate Normalized UIDs within the import document
  const seenUids = new Map<string, string>(); // normalized -> original
  const duplicateErrors: ImportValidationError[] = [];

  for (let idx = 0; idx < validDoc.tags.length; idx++) {
    const tag = validDoc.tags[idx];
    const rawUid = tag.uid;
    const normalized = normalizeUid(rawUid);

    if (!normalized) {
      duplicateErrors.push({
        path: `/tags/${idx}/uid`,
        message: `Tag at index ${idx} has an empty or invalid UID.`
      });
      continue;
    }

    if (seenUids.has(normalized)) {
      const firstSeenRaw = seenUids.get(normalized);
      duplicateErrors.push({
        path: `/tags/${idx}/uid`,
        message: `Ambiguous import: Multiple tags normalize to UID "${rawUid}" (matching earlier entry "${firstSeenRaw}"). Duplicate UIDs inside the same import file are prohibited.`
      });
    } else {
      seenUids.set(normalized, rawUid);
    }
  }

  if (duplicateErrors.length > 0) {
    return { ok: false, errors: duplicateErrors };
  }

  // Construct sanitized document with only whitelisted attributes
  const sanitizedDoc: NfcwebTagRegistryExportV1 = {
    format: CANONICAL_FORMAT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    exportedAt: validDoc.exportedAt,
    appVersion: validDoc.appVersion,
    tags: validDoc.tags.map(t => sanitizeImportedTag(t))
  };

  return {
    ok: true,
    document: sanitizedDoc,
    isLegacy: false
  };
}

/**
 * Validates legacy unversioned raw NFCTagItem[] array and transforms it into canonical v1 format.
 */
function validateLegacyArrayFormat(items: any[]): ImportValidationResult {
  const errors: ImportValidationError[] = [];
  const sanitizedTags: ExportableTagV1[] = [];
  const seenUids = new Map<string, string>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemPath = `/items/${i}`;

    if (!item || typeof item !== 'object') {
      errors.push({ path: itemPath, message: 'Array element must be a tag object.' });
      continue;
    }

    if (typeof item.uid !== 'string' || !item.uid.trim()) {
      errors.push({ path: `${itemPath}/uid`, message: 'Missing or empty string "uid".' });
      continue;
    }

    const norm = normalizeUid(item.uid);
    if (seenUids.has(norm)) {
      errors.push({
        path: `${itemPath}/uid`,
        message: `Ambiguous import: Multiple tags normalize to UID "${item.uid}". Duplicate UIDs inside the same import file are prohibited.`
      });
      continue;
    }
    seenUids.set(norm, item.uid);

    const firstSeen = typeof item.firstSeen === 'number' && item.firstSeen >= 0 ? Math.floor(item.firstSeen) : Date.now();
    const lastRead = typeof item.lastRead === 'number' && item.lastRead >= 0 ? Math.floor(item.lastRead) : Date.now();
    const readCount = typeof item.readCount === 'number' && item.readCount >= 0 ? Math.floor(item.readCount) : 1;
    const hasNdef = Boolean(item.hasNdef);

    const records: ExportableNDEFRecordV1[] = [];
    if (Array.isArray(item.records)) {
      for (let rIdx = 0; rIdx < item.records.length; rIdx++) {
        const r = item.records[rIdx];
        const rPath = `${itemPath}/records/${rIdx}`;
        if (!r || typeof r !== 'object') {
          errors.push({ path: rPath, message: 'NDEF record must be an object.' });
          continue;
        }
        if (!['text', 'url', 'mime', 'empty'].includes(r.recordType)) {
          errors.push({ path: `${rPath}/recordType`, message: `Invalid recordType "${String(r.recordType)}".` });
          continue;
        }
        if (r.recordType === 'mime' && (!r.mediaType || typeof r.mediaType !== 'string' || !r.mediaType.trim())) {
          errors.push({ path: `${rPath}/mediaType`, message: 'MIME record requires a non-empty mediaType.' });
          continue;
        }

        records.push({
          id: String(r.id || `rec-${i}-${rIdx}`),
          recordType: r.recordType,
          data: String(r.data ?? ''),
          mediaType: r.mediaType ? String(r.mediaType) : undefined,
          lang: r.lang ? String(r.lang) : undefined,
          encoding: r.encoding ? String(r.encoding) : undefined
        });
      }
    }

    const tag: ExportableTagV1 = {
      uid: String(item.uid).trim(),
      firstSeen,
      lastRead,
      readCount,
      hasNdef,
      records
    };

    if (typeof item.name === 'string' && item.name.trim()) tag.name = item.name.trim();
    if (['read', 'write', 'erase'].includes(item.lastAction)) tag.lastAction = item.lastAction;
    if (typeof item.tagType === 'string' && item.tagType.trim()) tag.tagType = item.tagType.trim();
    if (typeof item.notes === 'string' && item.notes.trim()) tag.notes = item.notes;
    if (typeof item.isSample === 'boolean') tag.isSample = item.isSample;

    sanitizedTags.push(tag);
  }

  if (errors.length > 0) {
    return { ok: false, errors, isLegacy: true };
  }

  return {
    ok: true,
    document: {
      format: CANONICAL_FORMAT,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: 'legacy-raw-array',
      tags: sanitizedTags
    },
    isLegacy: true,
    legacyWarning: '検出されたファイルは旧形式の非バージョン管理タグ配列です。v1形式に正規化して取り込みます。'
  };
}

/**
 * Strips unknown/prototype properties and constructs a clean ExportableTagV1 object.
 */
function sanitizeImportedTag(rawTag: ExportableTagV1): ExportableTagV1 {
  const records: ExportableNDEFRecordV1[] = (rawTag.records || []).map(r => ({
    id: String(r.id),
    recordType: r.recordType,
    data: String(r.data ?? ''),
    ...(r.mediaType ? { mediaType: String(r.mediaType) } : {}),
    ...(r.lang ? { lang: String(r.lang) } : {}),
    ...(r.encoding ? { encoding: String(r.encoding) } : {})
  }));

  const clean: ExportableTagV1 = {
    uid: String(rawTag.uid).trim(),
    firstSeen: Math.floor(rawTag.firstSeen),
    lastRead: Math.floor(rawTag.lastRead),
    readCount: Math.floor(rawTag.readCount),
    hasNdef: Boolean(rawTag.hasNdef),
    records
  };

  if (typeof rawTag.name === 'string' && rawTag.name.trim()) {
    clean.name = rawTag.name.trim();
  }
  if (rawTag.lastAction && ['read', 'write', 'erase'].includes(rawTag.lastAction)) {
    clean.lastAction = rawTag.lastAction;
  }
  if (typeof rawTag.tagType === 'string' && rawTag.tagType.trim()) {
    clean.tagType = rawTag.tagType.trim();
  }
  if (typeof rawTag.notes === 'string' && rawTag.notes.trim()) {
    clean.notes = rawTag.notes;
  }
  if (typeof rawTag.isSample === 'boolean') {
    clean.isSample = rawTag.isSample;
  }

  return clean;
}
