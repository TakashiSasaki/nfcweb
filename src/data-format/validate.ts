// Runtime schema and semantic validation for Canonical v1 Tag Registry
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import registrySchema from './nfcweb-tag-registry.schema.json';
import {
  CANONICAL_FORMAT,
  CANONICAL_SCHEMA_VERSION,
  NfcwebTagRegistryExportV1,
  ImportValidationResult,
  ImportValidationError
} from './types';
import { isValidCanonicalUid, canonicalizeUid } from '../domain/uid';

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
 * Convenience wrapper returning boolean isValid and string error array.
 */
export function validateCanonicalExportDocument(doc: unknown): { isValid: boolean; errors: string[] } {
  const res = validateImportPayload(doc);
  return {
    isValid: res.ok,
    errors: res.errors?.map(e => `${e.path}: ${e.message}`) || []
  };
}

/**
 * Validates unknown JSON payload against the canonical JSON schema and domain invariants.
 * Fails closed on unknown properties, invalid types, duplicate UIDs, or timestamp inversions.
 */
export function validateImportPayload(input: unknown): ImportValidationResult {
  if (input === null || input === undefined) {
    return {
      ok: false,
      errors: [{ path: '#', message: 'Import data is empty or undefined.' }]
    };
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{
        path: '#',
        message: Array.isArray(input)
          ? 'Legacy plain tag array is not supported. Please provide a canonical { format, schemaVersion, tags, ... } object.'
          : 'Import data must be a valid JSON object.'
      }]
    };
  }

  const recordObj = input as Record<string, any>;

  // Check format identifier explicitly for clear error messages
  if (!('format' in recordObj)) {
    return {
      ok: false,
      errors: [{ path: '/format', message: `Missing required property 'format'. Expected "${CANONICAL_FORMAT}".` }]
    };
  }

  if (recordObj.format !== CANONICAL_FORMAT) {
    return {
      ok: false,
      errors: [{ path: '/format', message: `Unsupported format identifier "${String(recordObj.format)}". Expected "${CANONICAL_FORMAT}".` }]
    };
  }

  // Check schemaVersion explicitly for forward compatibility guidance
  if (!('schemaVersion' in recordObj)) {
    return {
      ok: false,
      errors: [{ path: '/schemaVersion', message: `Missing required property 'schemaVersion'. Expected ${CANONICAL_SCHEMA_VERSION}.` }]
    };
  }

  if (typeof recordObj.schemaVersion === 'number' && recordObj.schemaVersion > CANONICAL_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [{
        path: '/schemaVersion',
        message: `Unsupported future schema version (${recordObj.schemaVersion}). This version of NFCWeb only supports schema v${CANONICAL_SCHEMA_VERSION}. Please update the application.`
      }]
    };
  }

  if (recordObj.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [{
        path: '/schemaVersion',
        message: `Invalid schema version (${String(recordObj.schemaVersion)}). Expected v${CANONICAL_SCHEMA_VERSION}.`
      }]
    };
  }

  // 1. Structural validation via compiled authoritative JSON Schema
  const isSchemaValid = validateSchema(input);
  if (!isSchemaValid && validateSchema.errors) {
    const errors: ImportValidationError[] = validateSchema.errors.map(err => {
      const path = err.instancePath || (err.params as any)?.missingProperty
        ? `${err.instancePath || ''}/${(err.params as any)?.missingProperty || ''}`.replace(/\/+/g, '/')
        : '#';
      return {
        path: path.startsWith('/') ? path : `/${path}`,
        message: err.message ? `${err.message}${err.params ? ` (${JSON.stringify(err.params)})` : ''}` : 'Schema validation error',
        keyword: err.keyword
      };
    });
    return { ok: false, errors };
  }

  const validDoc = input as NfcwebTagRegistryExportV1;

  // 2. Semantic Checks:
  // - Strict canonical UID formatting & even-length byte verification
  // - Prohibit duplicate canonical UIDs in one document
  // - Invariant: firstSeen <= lastRead
  const seenUids = new Map<string, number>(); // canonicalUid -> tag index
  const semanticErrors: ImportValidationError[] = [];

  for (let idx = 0; idx < validDoc.tags.length; idx++) {
    const tag = validDoc.tags[idx];
    const canonical = canonicalizeUid(tag.uid);

    // UID validation
    if (!isValidCanonicalUid(canonical) || canonical !== tag.uid) {
      semanticErrors.push({
        path: `/tags/${idx}/uid`,
        message: `Tag (index ${idx}) UID "${tag.uid}" violates canonical format (lowercase hexadecimal, even length 8-32, no separators).`
      });
      continue;
    }

    // Duplicate UID check
    if (seenUids.has(canonical)) {
      const priorIdx = seenUids.get(canonical)!;
      semanticErrors.push({
        path: `/tags/${idx}/uid`,
        message: `Duplicate UID error: UID "${canonical}" appears multiple times in import file (index ${priorIdx} and index ${idx}). Duplicate UIDs are prohibited.`
      });
    } else {
      seenUids.set(canonical, idx);
    }

    // Timestamp invariant: firstSeen <= lastRead
    if (typeof tag.firstSeen === 'number' && typeof tag.lastRead === 'number') {
      if (tag.firstSeen > tag.lastRead) {
        semanticErrors.push({
          path: `/tags/${idx}/firstSeen`,
          message: `Timestamp consistency error: firstSeen (${tag.firstSeen}) must be less than or equal to lastRead (${tag.lastRead}).`
        });
      }
    }
  }

  if (semanticErrors.length > 0) {
    return { ok: false, errors: semanticErrors };
  }

  return {
    ok: true,
    document: validDoc
  };
}
