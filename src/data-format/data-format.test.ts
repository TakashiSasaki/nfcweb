import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
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
  TagRegistryExportDocumentV1,
  ExportableTagV1
} from './index';
import { 
  isValidCanonicalUid, 
  canonicalizeUid, 
  normalizeUid 
} from '../domain/uid';
import { 
  loadTagRegistry, 
  saveTagRegistry, 
  clearTagRegistry, 
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

describe('Domain: Canonical UID', () => {
  it('validates canonical UIDs (lowercase hex, no separators, even length >= 2)', () => {
    expect(isValidCanonicalUid('045ab23c9d8001')).toBe(true);
    expect(isValidCanonicalUid('04112233445566')).toBe(true);
    expect(isValidCanonicalUid('04a1b2c3')).toBe(true);

    // Invalid canonical forms
    expect(isValidCanonicalUid('04:5A:B2:3C')).toBe(false); // Colons
    expect(isValidCanonicalUid('04-5a-b2-3c')).toBe(false); // Hyphens
    expect(isValidCanonicalUid('045AB23C')).toBe(false); // Uppercase
    expect(isValidCanonicalUid('123')).toBe(false); // Odd length
    expect(isValidCanonicalUid('')).toBe(false); // Empty
    expect(isValidCanonicalUid('xyz123')).toBe(false); // Non-hex
  });

  it('canonicalizes non-canonical strings into strict canonical lowercase hex', () => {
    expect(canonicalizeUid('04:5A:B2:3C:9D:80:01')).toBe('045ab23c9d8001');
    expect(canonicalizeUid('04-5a-b2-3c-9d-80-01')).toBe('045ab23c9d8001');
    expect(canonicalizeUid('  045AB2  ')).toBe('045ab2');
    expect(isValidCanonicalUid('invalid non hex')).toBe(false);
  });

  it('normalizes UID identically for comparison', () => {
    expect(normalizeUid('04:5A:B2:3C')).toBe('045ab23c');
    expect(normalizeUid('04-5a-b2-3c')).toBe('045ab23c');
  });
});

describe('Canonical JSON Schema (Draft 2020-12)', () => {
  it('has Draft 2020-12 $schema and correct metadata', () => {
    expect(registrySchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(registrySchema.title).toBe('NFCWeb Tag Registry Interchange Schema');
    expect(registrySchema.additionalProperties).toBe(false);
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
    expect(res.errors?.[0].message).toContain('プレーンなタグ配列');
  });

  it('rejects unrecognized format identifier', () => {
    const badFormat = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      format: 'unknown-format'
    };
    const res = validateImportPayload(badFormat);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].message).toContain('未対応のフォーマット識別子');
  });

  it('rejects future or non-v1 schemaVersion', () => {
    const futureDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      schemaVersion: 2
    };
    const res = validateImportPayload(futureDoc);
    expect(res.ok).toBe(false);
    expect(res.errors?.[0].message).toContain('未対応の将来のスキーマバージョン');
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
    expect(res.errors?.[0].message).toContain('UID重複エラー');
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

describe('Export & Codec', () => {
  const mockTags: NFCTagItem[] = [
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
      records: [
        { id: 'rec-1', recordType: 'url', data: 'https://takashisasaki.github.io' },
        { id: 'rec-2', recordType: 'text', data: 'Tag message', lang: 'ja', encoding: 'utf-8' },
        { id: 'rec-3', recordType: 'mime', mediaType: 'application/json', data: '{"status":"ok"}' },
        { id: 'rec-4', recordType: 'empty', data: '' }
      ]
    }
  ];

  it('builds canonical v1 export document and ensures canonical UIDs', () => {
    const doc = buildTagRegistryExportV1(mockTags, '1.0.51', new Date('2026-09-07T10:00:00.000Z'));
    expect(doc.format).toBe(CANONICAL_FORMAT);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.appVersion).toBe('1.0.51');
    expect(doc.exportedAt).toBe('2026-09-07T10:00:00.000Z');
    expect(doc.tags.length).toBe(1);
    expect(doc.tags[0].uid).toBe('04112233445566');
    expect(doc.tags[0].records.length).toBe(4);
  });

  it('serializes and deserializes cleanly', () => {
    const doc = buildTagRegistryExportV1(mockTags, '1.0.51');
    const jsonStr = serializeExportDocument(doc);
    const roundTrip = deserializeExportDocument(jsonStr);
    expect(roundTrip.tags.length).toBe(1);
    expect(roundTrip.tags[0].uid).toBe(mockTags[0].uid);
  });

  it('generates standardized export filename', () => {
    const fixedDate = new Date(2026, 8, 7, 12, 34, 56);
    expect(generateExportFilename(fixedDate)).toBe('nfcweb-tags-v1-20260907-123456.json');
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
});

describe('Storage Abstraction: tagRegistryStorage', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('clears tag registry and legacy storage keys', () => {
    localStorage.setItem(STORAGE_KEY_TAG_REGISTRY, JSON.stringify([{ uid: '0411' }]));
    localStorage.setItem('nfc_tags', 'legacy');
    clearTagRegistry();
    expect(localStorage.getItem(STORAGE_KEY_TAG_REGISTRY)).toBeNull();
    expect(localStorage.getItem('nfc_tags')).toBeNull();
  });
});
