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
      errors: [{ path: '#', message: 'インポートデータが空または未定義です。' }]
    };
  }

  if (typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      errors: [{
        path: '#',
        message: Array.isArray(input)
          ? 'レガシー形式のプレーンなタグ配列は非対応です。正規の { format, schemaVersion, tags, ... } オブジェクトを指定してください。'
          : 'インポートデータは正規のJSONオブジェクトである必要があります。'
      }]
    };
  }

  const recordObj = input as Record<string, any>;

  // Check format identifier explicitly for clear error messages
  if (!('format' in recordObj)) {
    return {
      ok: false,
      errors: [{ path: '/format', message: `必須プロパティ 'format' がありません。"${CANONICAL_FORMAT}" を指定してください。` }]
    };
  }

  if (recordObj.format !== CANONICAL_FORMAT) {
    return {
      ok: false,
      errors: [{ path: '/format', message: `未対応のフォーマット識別子 "${String(recordObj.format)}" です。"${CANONICAL_FORMAT}" を指定してください。` }]
    };
  }

  // Check schemaVersion explicitly for forward compatibility guidance
  if (!('schemaVersion' in recordObj)) {
    return {
      ok: false,
      errors: [{ path: '/schemaVersion', message: `必須プロパティ 'schemaVersion' がありません。${CANONICAL_SCHEMA_VERSION} を指定してください。` }]
    };
  }

  if (typeof recordObj.schemaVersion === 'number' && recordObj.schemaVersion > CANONICAL_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [{
        path: '/schemaVersion',
        message: `未対応の将来のスキーマバージョン (${recordObj.schemaVersion}) です。本バージョンのNFCWebはスキーマ v${CANONICAL_SCHEMA_VERSION} にのみ対応しています。アプリケーションを更新してください。`
      }]
    };
  }

  if (recordObj.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [{
        path: '/schemaVersion',
        message: `無効なスキーマバージョン (${String(recordObj.schemaVersion)}) です。v${CANONICAL_SCHEMA_VERSION} を指定してください。`
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
        message: err.message ? `${err.message}${err.params ? ` (${JSON.stringify(err.params)})` : ''}` : 'スキーマ検証エラー',
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
        message: `タグ (index ${idx}) のUID "${tag.uid}" は正準フォーマット (小文字16進数・偶数桁・区切り文字なし) に違反しています。`
      });
      continue;
    }

    // Duplicate UID check
    if (seenUids.has(canonical)) {
      const priorIdx = seenUids.get(canonical)!;
      semanticErrors.push({
        path: `/tags/${idx}/uid`,
        message: `UID重複エラー: UID "${canonical}" がインポートファイル内で複数回出現しています (index ${priorIdx} および index ${idx})。1ファイル内でのUID重複は禁止されています。`
      });
    } else {
      seenUids.set(canonical, idx);
    }

    // Timestamp invariant: firstSeen <= lastRead
    if (typeof tag.firstSeen === 'number' && typeof tag.lastRead === 'number') {
      if (tag.firstSeen > tag.lastRead) {
        semanticErrors.push({
          path: `/tags/${idx}/firstSeen`,
          message: `タイムスタンプ整合性エラー: 初回検出日時 firstSeen (${tag.firstSeen}) は最終読込日時 lastRead (${tag.lastRead}) 以下である必要があります。`
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
