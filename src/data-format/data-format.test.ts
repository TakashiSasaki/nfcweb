import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { 
  registrySchema,
  validateImportPayload,
  validateCanonicalExportDocument,
  buildTagRegistryExportV1,
  serializeExportDocument,
  deserializeExportDocument,
  generateExportFilename,
  buildImportPlan,
  applyImportPlan,
  EXAMPLE_TAG_REGISTRY_V1,
  CANONICAL_FORMAT,
  CANONICAL_SCHEMA_VERSION,
  CANONICAL_UID_PATTERN,
  TagRegistryExportDocumentV1,
  ExportableTagV1
} from './index';
import { 
  isValidCanonicalUid, 
  canonicalizeUid, 
  normalizeUid,
  formatUidForDisplay,
  CANONICAL_UID_REGEX
} from '../domain/uid';
import { 
  loadTagRegistry, 
  saveTagRegistry, 
  clearTagRegistry, 
  commitTagRegistry,
  STORAGE_KEY_TAG_REGISTRY 
} from '../storage/tagRegistryStorage';
import { NFCTagItem } from '../types';

// Mock localStorage for headless Node/Vitest test environment
class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] !== undefined ? this.store[key] : null;
  }

  setItem(key: string, value: string) {
    this.store[key] = String(value);
  }

  removeItem(key: string) {
    delete this.store[key];
  }
}

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    (globalThis as any).localStorage = new LocalStorageMock();
  }
});

describe('Domain: Canonical UID & SSOT Alignment', () => {
  it('derives CANONICAL_UID_PATTERN directly from JSON Schema SSOT', () => {
    expect(CANONICAL_UID_PATTERN).toBe(registrySchema.$defs.ExportableTagV1.properties.uid.pattern);
    expect(CANONICAL_UID_REGEX.source).toBe(registrySchema.$defs.ExportableTagV1.properties.uid.pattern);
  });

  it('validates canonical UIDs (lowercase hex, no separators, even length 8-32)', () => {
    expect(isValidCanonicalUid('045ab23c9d8001')).toBe(true);
    expect(isValidCanonicalUid('04112233445566')).toBe(true);
    expect(isValidCanonicalUid('04a1b2c3')).toBe(true); // 8 chars (4 bytes)
    expect(isValidCanonicalUid('0123456789abcdef0123456789abcdef')).toBe(true); // 32 chars (16 bytes)

    // Invalid canonical forms
    expect(isValidCanonicalUid('04:5A:B2:3C')).toBe(false); // Colons
    expect(isValidCanonicalUid('04-5a-b2-3c')).toBe(false); // Hyphens
    expect(isValidCanonicalUid('045AB23C')).toBe(false); // Uppercase
    expect(isValidCanonicalUid('123')).toBe(false); // Odd length / too short
    expect(isValidCanonicalUid('123456')).toBe(false); // 6 chars (< 8)
    expect(isValidCanonicalUid('123456789')).toBe(false); // 9 chars (odd length in range 8-32)
    expect(isValidCanonicalUid('123456789ab')).toBe(false); // 11 chars (odd length in range 8-32)
    expect(isValidCanonicalUid('0123456789abc')).toBe(false); // 13 chars (odd length in range 8-32)
    expect(isValidCanonicalUid('0123456789abcdef0123456789abcdef0')).toBe(false); // 33 chars (> 32, odd)
    expect(isValidCanonicalUid('0123456789abcdef0123456789abcdef00')).toBe(false); // 34 chars (> 32)
    expect(isValidCanonicalUid('')).toBe(false); // Empty
    expect(isValidCanonicalUid('xyz12345')).toBe(false); // Non-hex
  });

  it('canonicalizes non-canonical strings into strict canonical lowercase hex', () => {
    expect(canonicalizeUid('04:5A:B2:3C:9D:80:01')).toBe('045ab23c9d8001');
    expect(canonicalizeUid('04-5a-b2-3c-9d-80-01')).toBe('045ab23c9d8001');
    expect(canonicalizeUid('  045AB23C  ')).toBe('045ab23c');
    expect(isValidCanonicalUid('invalid non hex')).toBe(false);
  });

  it('normalizes UID identically for comparison and formats for display', () => {
    expect(normalizeUid('04:5A:B2:3C')).toBe('045ab23c');
    expect(normalizeUid('04-5a-b2-3c')).toBe('045ab23c');
    expect(formatUidForDisplay('045ab23c')).toBe('04:5a:b2:3c');
  });

  it('ensures Schema UID pattern and Domain UID regex behavior match across test vectors', () => {
    const testCases = [
      // Valid boundaries
      { uid: '04a1b2c3', valid: true }, // 8 chars (4 bytes)
      { uid: '045ab23c', valid: true }, // 8 chars
      { uid: '045ab23c9d8001', valid: true }, // 14 chars (7 bytes)
      { uid: '0123456789abcdef0123456789abcdef', valid: true }, // 32 chars (16 bytes)

      // Odd-length inside allowed 8-32 range (rejected by both schema and domain)
      { uid: '123456789', valid: false }, // 9 chars
      { uid: '123456789ab', valid: false }, // 11 chars
      { uid: '0123456789abc', valid: false }, // 13 chars
      { uid: '0123456789abcdef0123456789abcde', valid: false }, // 31 chars

      // Invalid boundaries (< 8 chars, > 32 chars)
      { uid: '123456', valid: false }, // 6 chars (< 8)
      { uid: '1234567', valid: false }, // 7 chars (< 8)
      { uid: '0123456789abcdef0123456789abcdef0', valid: false }, // 33 chars (> 32, odd)
      { uid: '0123456789abcdef0123456789abcdef00', valid: false }, // 34 chars (> 32, even)

      // Formatting & non-hex
      { uid: '04:5a:b2:3c', valid: false }, // Separators (colons)
      { uid: '04-5a-b2-3c', valid: false }, // Separators (hyphens)
      { uid: '045AB23C', valid: false }, // Uppercase
      { uid: 'gggggggg', valid: false }, // Non-hex
      { uid: 'xyz12345', valid: false }, // Non-hex
      { uid: '', valid: false } // Empty
    ];

    const schemaRegex = new RegExp(registrySchema.$defs.ExportableTagV1.properties.uid.pattern);
    for (const { uid, valid } of testCases) {
      expect(isValidCanonicalUid(uid)).toBe(valid);
      expect(schemaRegex.test(uid)).toBe(valid);
      expect(CANONICAL_UID_REGEX.test(uid)).toBe(valid);
    }
  });
});

describe('Canonical JSON Schema (Draft 2020-12)', () => {
  it('has Draft 2020-12 $schema and correct metadata', () => {
    expect(registrySchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(registrySchema.title).toBe('NFCWeb Tag Registry Interchange Schema');
    expect(registrySchema.additionalProperties).toBe(false);
  });

  it('derives CANONICAL constants strictly from schema SSOT', () => {
    expect(CANONICAL_FORMAT).toBe(registrySchema.properties.format.const);
    expect(CANONICAL_SCHEMA_VERSION).toBe(registrySchema.properties.schemaVersion.const);
  });

  it('validates the canonical example document successfully', () => {
    const res = validateCanonicalExportDocument(EXAMPLE_TAG_REGISTRY_V1);
    expect(res.isValid).toBe(true);
    expect(res.errors).toEqual([]);

    const payloadRes = validateImportPayload(EXAMPLE_TAG_REGISTRY_V1);
    expect(payloadRes.ok).toBe(true);
    expect(payloadRes.document.format).toBe(CANONICAL_FORMAT);
    expect(payloadRes.document.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
  });
});

describe('Decisive Rejection of Non-Canonical & Legacy Formats', () => {
  it('rejects raw legacy tag arrays with clear error message', () => {
    const rawArray = [
      {
        uid: '045ab23c',
        name: 'Legacy Tag',
        firstSeen: 1000,
        lastRead: 2000,
        readCount: 1,
        hasNdef: false,
        records: []
      }
    ];

    const res = validateImportPayload(rawArray);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].message).toContain('Legacy plain tag array is not supported');
  });

  it('rejects unrecognized format identifier', () => {
    const badFormat = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      format: 'unknown-format'
    };
    const res = validateImportPayload(badFormat);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].message).toContain('Unsupported format identifier');
  });

  it('rejects future or non-v1 schemaVersion', () => {
    const futureDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      schemaVersion: 2
    };
    const res = validateImportPayload(futureDoc);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].message).toContain('Unsupported future schema version');
  });

  it('rejects uncanonical UIDs (e.g. with colons or uppercase) in strict canonical import', () => {
    const uncanonicalUidDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [
        {
          ...EXAMPLE_TAG_REGISTRY_V1.tags[0],
          uid: '04:5A:B2:3C'
        }
      ]
    };
    const res = validateImportPayload(uncanonicalUidDoc);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].message).toContain('pattern');
  });

  it('rejects odd-length in-range UIDs (e.g. 9 hex chars) by strict schema pattern', () => {
    const oddUidDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [
        {
          ...EXAMPLE_TAG_REGISTRY_V1.tags[0],
          uid: '123456789'
        }
      ]
    };
    const res = validateImportPayload(oddUidDoc);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].message).toContain('pattern');
  });

  it('rejects duplicate UIDs in the same document', () => {
    const dupDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [
        EXAMPLE_TAG_REGISTRY_V1.tags[0],
        { ...EXAMPLE_TAG_REGISTRY_V1.tags[0], name: 'Duplicate UID' }
      ]
    };
    const res = validateImportPayload(dupDoc);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].message).toContain('Duplicate UID error');
  });

  it('rejects unknown additional properties', () => {
    const hackDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      unexpectedField: 'forbidden'
    };
    const res = validateImportPayload(hackDoc);
    expect(res.ok).toBe(false);
  });
});

describe('Export & Codec Invariant Enforcement (No Silent Repair)', () => {
  const validMockTags: NFCTagItem[] = [
    {
      uid: '04112233445566',
      name: 'Test Tag 1',
      firstSeen: 1788700000000,
      lastRead: 1788750000000,
      readCount: 5,
      lastAction: 'read',
      tagType: 'NTAG215',
      hasNdef: true,
      notes: 'Test note',
      isSample: true, // Should be excluded from export
      records: [
        { id: 'rec-1', recordType: 'url', data: 'https://takashisasaki.github.io' },
        { id: 'rec-2', recordType: 'text', data: 'Tag message', lang: 'ja', encoding: 'utf-8' },
        { id: 'rec-3', recordType: 'mime', mediaType: 'application/json', data: '{"status":"ok"}' },
        { id: 'rec-4', recordType: 'empty', data: '' }
      ]
    }
  ];

  it('builds canonical v1 export document and strips isSample', () => {
    const doc = buildTagRegistryExportV1(validMockTags, '1.0.51', new Date('2026-09-07T10:00:00.000Z'));
    expect(doc.format).toBe(CANONICAL_FORMAT);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.appVersion).toBe('1.0.51');
    expect(doc.exportedAt).toBe('2026-09-07T10:00:00.000Z');
    expect(doc.tags.length).toBe(1);
    expect(doc.tags[0].uid).toBe('04112233445566');
    expect(doc.tags[0].records.length).toBe(4);
    expect((doc.tags[0] as any).isSample).toBeUndefined();
  });

  it('builds, validates, serializes, and deserializes an empty registry (0 tags)', () => {
    const doc = buildTagRegistryExportV1([], '1.0.53', new Date('2026-09-07T12:00:00.000Z'));
    expect(doc.format).toBe(CANONICAL_FORMAT);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.appVersion).toBe('1.0.53');
    expect(doc.exportedAt).toBe('2026-09-07T12:00:00.000Z');
    expect(doc.tags).toEqual([]);

    const schemaRes = validateCanonicalExportDocument(doc);
    expect(schemaRes.isValid).toBe(true);
    expect(schemaRes.errors).toEqual([]);

    const payloadRes = validateImportPayload(doc);
    expect(payloadRes.ok).toBe(true);
    expect(payloadRes.document.tags).toEqual([]);

    const jsonStr = serializeExportDocument(doc);
    expect(jsonStr).toContain('"tags": []');

    const roundTrip = deserializeExportDocument(jsonStr);
    expect(roundTrip.tags).toEqual([]);
    expect(roundTrip.format).toBe(CANONICAL_FORMAT);
    expect(roundTrip.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it('serializes and deserializes cleanly', () => {
    const doc = buildTagRegistryExportV1(validMockTags, '1.0.51');
    const jsonStr = serializeExportDocument(doc);
    const roundTrip = deserializeExportDocument(jsonStr);
    expect(roundTrip.tags.length).toBe(1);
    expect(roundTrip.tags[0].uid).toBe(validMockTags[0].uid);
  });

  it('generates standardized export filename', () => {
    const fixedDate = new Date(2026, 8, 7, 12, 34, 56);
    expect(generateExportFilename(fixedDate)).toBe('nfcweb-tags-v1-20260907-123456.json');
  });

  it('rejects inverted timestamps (firstSeen > lastRead) explicitly instead of silently repairing', () => {
    const invertedTags: NFCTagItem[] = [
      {
        ...validMockTags[0],
        firstSeen: 2000,
        lastRead: 1000 // Inverted!
      }
    ];

    expect(() => buildTagRegistryExportV1(invertedTags, '1.0.51')).toThrow(
      /violates timestamp invariant: firstSeen/
    );
  });

  it('rejects invalid timestamps explicitly', () => {
    const badTimestampTags: NFCTagItem[] = [
      {
        ...validMockTags[0],
        firstSeen: NaN
      }
    ];
    expect(() => buildTagRegistryExportV1(badTimestampTags, '1.0.51')).toThrow(
      /invalid firstSeen timestamp/
    );
  });

  it('rejects MIME record with missing mediaType explicitly instead of inventing a fallback', () => {
    const badMimeTags: NFCTagItem[] = [
      {
        ...validMockTags[0],
        records: [
          { id: 'rec-mime-1', recordType: 'mime', data: 'data', mediaType: '' }
        ]
      }
    ];
    expect(() => buildTagRegistryExportV1(badMimeTags, '1.0.51')).toThrow(
      /missing required mediaType/
    );
  });

  it('rejects records with missing id explicitly', () => {
    const badRecordTags: NFCTagItem[] = [
      {
        ...validMockTags[0],
        records: [
          { id: '', recordType: 'text', data: 'hello' }
        ]
      }
    ];
    expect(() => buildTagRegistryExportV1(badRecordTags, '1.0.51')).toThrow(
      /missing required id/
    );
  });

  it('rejects invalid canonical UIDs explicitly', () => {
    const badUidTags: NFCTagItem[] = [
      {
        ...validMockTags[0],
        uid: 'short'
      }
    ];
    expect(() => buildTagRegistryExportV1(badUidTags, '1.0.51')).toThrow(
      /invalid canonical UID/
    );
  });
});

describe('ImportPlan (Merge & Replace)', () => {
  const localTags: NFCTagItem[] = [
    {
      uid: '04111111',
      name: 'Existing Tag 1',
      firstSeen: 1000,
      lastRead: 2000,
      readCount: 2,
      hasNdef: false,
      records: []
    },
    {
      uid: '04222222',
      name: 'Existing Tag 2',
      firstSeen: 1000,
      lastRead: 3000,
      readCount: 4,
      hasNdef: true,
      records: [{ id: 'r1', recordType: 'text', data: 'Old Record' }]
    }
  ];

  const incomingDoc: TagRegistryExportDocumentV1 = {
    format: CANONICAL_FORMAT,
    schemaVersion: 1,
    exportedAt: '2026-09-07T12:00:00.000Z',
    appVersion: '1.0.51',
    tags: [
      {
        uid: '04222222', // Overlap / conflict with Tag 2
        name: 'Updated Tag 2 (From Import)',
        firstSeen: 1000,
        lastRead: 6000,
        readCount: 8,
        hasNdef: true,
        records: [{ id: 'r2', recordType: 'url', data: 'https://updated.com' }]
      },
      {
        uid: '04333333', // Brand new tag
        name: 'New Tag 3',
        firstSeen: 5000,
        lastRead: 5000,
        readCount: 1,
        hasNdef: false,
        records: []
      }
    ]
  };

  it('computes merge plan: adds new, updates conflicting (file-wins), preserves untouched', () => {
    const plan = buildImportPlan(incomingDoc, localTags, 'merge');
    expect(plan.mode).toBe('merge');
    expect(plan.importCount).toBe(2);
    expect(plan.newCount).toBe(1);
    expect(plan.updateCount).toBe(1);
    expect(plan.unchangedCount).toBe(0);
    expect(plan.removedCount).toBe(0);
    expect(plan.resultingCount).toBe(3);

    const resultingTags = applyImportPlan(plan);
    expect(resultingTags.length).toBe(3);

    const tag1 = resultingTags.find(t => t.uid === '04111111');
    expect(tag1?.name).toBe('Existing Tag 1');

    const tag2 = resultingTags.find(t => t.uid === '04222222');
    expect(tag2?.name).toBe('Updated Tag 2 (From Import)');
    expect(tag2?.readCount).toBe(8);

    const tag3 = resultingTags.find(t => t.uid === '04333333');
    expect(tag3?.name).toBe('New Tag 3');
  });

  it('computes replace plan: discards all existing local tags, only keeps imported tags', () => {
    const plan = buildImportPlan(incomingDoc, localTags, 'replace');
    expect(plan.mode).toBe('replace');
    expect(plan.importCount).toBe(2);
    expect(plan.newCount).toBe(1);
    expect(plan.updateCount).toBe(1);
    expect(plan.removedCount).toBe(1);
    expect(plan.resultingCount).toBe(2);

    const resultingTags = applyImportPlan(plan);
    expect(resultingTags.length).toBe(2);
    expect(resultingTags.some(t => t.uid === '04111111')).toBe(false);
    expect(resultingTags.some(t => t.uid === '04222222')).toBe(true);
    expect(resultingTags.some(t => t.uid === '04333333')).toBe(true);
  });

  it('identifies unchanged tags when attributes and records match exactly', () => {
    const identicalDoc: TagRegistryExportDocumentV1 = {
      format: CANONICAL_FORMAT,
      schemaVersion: 1,
      exportedAt: '2026-09-07T12:00:00.000Z',
      appVersion: '1.0.51',
      tags: [
        {
          uid: '04111111',
          name: 'Existing Tag 1',
          firstSeen: 1000,
          lastRead: 2000,
          readCount: 2,
          hasNdef: false,
          records: []
        }
      ]
    };

    const plan = buildImportPlan(identicalDoc, localTags, 'merge');
    expect(plan.unchangedCount).toBe(1);
    expect(plan.newCount).toBe(0);
    expect(plan.updateCount).toBe(0);
    expect(plan.actions.find(a => a.uid === '04111111')?.status).toBe('unchanged');
  });
});

describe('Storage Abstraction: tagRegistryStorage & Quota Regression', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('saves and loads tags with canonical UID normalization and lastRead descending sort', () => {
    const mockList: NFCTagItem[] = [
      {
        uid: '04:11:22:33', // uncanonical input
        firstSeen: 1000,
        lastRead: 2000,
        readCount: 1,
        hasNdef: false,
        records: []
      },
      {
        uid: '04AABBCC', // uppercase input
        firstSeen: 1000,
        lastRead: 5000, // higher lastRead
        readCount: 2,
        hasNdef: false,
        records: []
      }
    ];

    const saveRes = saveTagRegistry(mockList);
    expect(saveRes.success).toBe(true);

    const loaded = loadTagRegistry();
    expect(loaded.length).toBe(2);
    // Highest lastRead first:
    expect(loaded[0].uid).toBe('04aabbcc');
    expect(loaded[0].lastRead).toBe(5000);
    expect(loaded[1].uid).toBe('04112233');
    expect(loaded[1].lastRead).toBe(2000);
  });

  it('clears tag registry from localStorage', () => {
    localStorage.setItem(STORAGE_KEY_TAG_REGISTRY, JSON.stringify([{ uid: '0411' }]));
    clearTagRegistry();
    expect(localStorage.getItem(STORAGE_KEY_TAG_REGISTRY)).toBeNull();
  });

  it('handles QuotaExceededError gracefully in saveTagRegistry', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const quotaErr = new Error('Quota exceeded');
      quotaErr.name = 'QuotaExceededError';
      throw quotaErr;
    });

    const res = saveTagRegistry([{ uid: '04112233', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [] }]);
    expect(res.success).toBe(false);
    expect(res.error).toContain('QuotaExceededError');
  });

  it('regression: commitTagRegistry does NOT update state when storage write fails', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      const quotaErr = new Error('Disk full');
      quotaErr.name = 'QuotaExceededError';
      throw quotaErr;
    });

    let stateUpdated = false;
    const res = commitTagRegistry(
      [{ uid: '04112233', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [] }],
      () => {
        stateUpdated = true;
      }
    );

    expect(res.success).toBe(false);
    expect(stateUpdated).toBe(false);
  });

  it('commitTagRegistry invokes applyStateUpdate when storage write succeeds', () => {
    let persistedCount = 0;
    const res = commitTagRegistry(
      [{ uid: '04112233', firstSeen: 1000, lastRead: 1000, readCount: 1, hasNdef: false, records: [] }],
      (persisted) => {
        persistedCount = persisted.length;
      }
    );

    expect(res.success).toBe(true);
    expect(persistedCount).toBe(1);
  });
});
