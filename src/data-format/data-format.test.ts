import { describe, it, expect } from 'vitest';
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
  TagRegistryExportDocumentV1
} from './index';
import {
  isValidCanonicalUid,
  canonicalizeUid,
  normalizeUid,
  formatUidForDisplay,
  CANONICAL_UID_REGEX
} from '../domain/uid';
import { NFCTagItem } from '../types';

describe('Domain: canonical UID and schema alignment', () => {
  it('derives the UID pattern from the canonical schema', () => {
    expect(CANONICAL_UID_PATTERN).toBe(registrySchema.$defs.ExportableTagV1.properties.uid.pattern);
    expect(CANONICAL_UID_REGEX.source).toBe(registrySchema.$defs.ExportableTagV1.properties.uid.pattern);
  });

  it('accepts only canonical lowercase even-length hex UIDs', () => {
    expect(isValidCanonicalUid('04a1b2c3')).toBe(true);
    expect(isValidCanonicalUid('045ab23c9d8001')).toBe(true);
    expect(isValidCanonicalUid('0123456789abcdef0123456789abcdef')).toBe(true);
    for (const invalid of ['04:5A:B2:3C', '04-5a-b2-3c', '045AB23C', '1234567', '123456789', 'xyz12345', '']) {
      expect(isValidCanonicalUid(invalid)).toBe(false);
    }
  });

  it('canonicalizes and formats UIDs deterministically', () => {
    expect(canonicalizeUid('04:5A:B2:3C:9D:80:01')).toBe('045ab23c9d8001');
    expect(normalizeUid('04-5a-b2-3c')).toBe('045ab23c');
    expect(formatUidForDisplay('045ab23c')).toBe('04:5a:b2:3c');
  });

  it('keeps schema and domain validation behavior aligned', () => {
    const schemaRegex = new RegExp(registrySchema.$defs.ExportableTagV1.properties.uid.pattern);
    for (const uid of ['04a1b2c3', '045ab23c9d8001', '0123456789abcdef0123456789abcdef']) {
      expect(schemaRegex.test(uid)).toBe(true);
      expect(CANONICAL_UID_REGEX.test(uid)).toBe(true);
    }
    for (const uid of ['123456789', '04:5a:b2:3c', '045AB23C', 'gggggggg']) {
      expect(schemaRegex.test(uid)).toBe(false);
      expect(CANONICAL_UID_REGEX.test(uid)).toBe(false);
    }
  });
});

describe('Canonical JSON schema', () => {
  it('uses Draft 2020-12 and strict top-level properties', () => {
    expect(registrySchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(registrySchema.title).toBe('NFCWeb Tag Registry Interchange Schema');
    expect(registrySchema.additionalProperties).toBe(false);
  });

  it('derives canonical constants from the schema SSOT', () => {
    expect(CANONICAL_FORMAT).toBe(registrySchema.properties.format.const);
    expect(CANONICAL_SCHEMA_VERSION).toBe(registrySchema.properties.schemaVersion.const);
  });

  it('validates the canonical example', () => {
    expect(validateCanonicalExportDocument(EXAMPLE_TAG_REGISTRY_V1)).toEqual({ isValid: true, errors: [] });
    const result = validateImportPayload(EXAMPLE_TAG_REGISTRY_V1);
    expect(result.ok).toBe(true);
    expect(result.document.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
  });

  it('rejects legacy arrays and unsupported format versions', () => {
    const legacy = validateImportPayload([{ uid: '045ab23c' }]);
    expect(legacy.ok).toBe(false);
    expect(legacy.errors?.[0].message).toContain('Legacy plain tag array is not supported');

    const badFormat = validateImportPayload({ ...EXAMPLE_TAG_REGISTRY_V1, format: 'unknown-format' });
    expect(badFormat.ok).toBe(false);
    const future = validateImportPayload({ ...EXAMPLE_TAG_REGISTRY_V1, schemaVersion: 2 });
    expect(future.ok).toBe(false);
  });

  it('rejects non-canonical and duplicate UIDs', () => {
    const uncanonical = validateImportPayload({
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [{ ...EXAMPLE_TAG_REGISTRY_V1.tags[0], uid: '04:5A:B2:3C' }]
    });
    expect(uncanonical.ok).toBe(false);

    const duplicate = validateImportPayload({
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [EXAMPLE_TAG_REGISTRY_V1.tags[0], { ...EXAMPLE_TAG_REGISTRY_V1.tags[0], name: 'Duplicate' }]
    });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.errors?.[0].message).toContain('Duplicate UID');
  });

  it('rejects unknown top-level properties', () => {
    expect(validateImportPayload({ ...EXAMPLE_TAG_REGISTRY_V1, unexpectedField: 'forbidden' }).ok).toBe(false);
  });
});

describe('Canonical export and codec invariants', () => {
  const validTags: NFCTagItem[] = [{
    uid: '04112233445566',
    name: 'Test Tag',
    firstSeen: 1788700000000,
    lastRead: 1788750000000,
    readCount: 5,
    lastAction: 'read',
    tagType: 'NTAG215',
    hasNdef: true,
    notes: 'Test note',
    isSample: true,
    records: [
      { id: 'rec-1', recordType: 'url', data: 'https://takashisasaki.github.io' },
      { id: 'rec-2', recordType: 'text', data: 'Tag message', lang: 'ja', encoding: 'utf-8' },
      { id: 'rec-3', recordType: 'mime', mediaType: 'application/json', data: '{"status":"ok"}' },
      { id: 'rec-4', recordType: 'empty', data: '' }
    ]
  }];

  it('builds a valid v1 export and strips local-only sample metadata', () => {
    const doc = buildTagRegistryExportV1(validTags, '1.0.70', new Date('2026-09-07T10:00:00.000Z'));
    expect(doc.format).toBe(CANONICAL_FORMAT);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.tags[0].uid).toBe('04112233445566');
    expect((doc.tags[0] as any).isSample).toBeUndefined();
  });

  it('round-trips an empty registry', () => {
    const doc = buildTagRegistryExportV1([], '1.0.70', new Date('2026-09-07T12:00:00.000Z'));
    expect(validateCanonicalExportDocument(doc).isValid).toBe(true);
    expect(deserializeExportDocument(serializeExportDocument(doc)).tags).toEqual([]);
  });

  it('round-trips a populated registry', () => {
    const doc = buildTagRegistryExportV1(validTags, '1.0.70');
    expect(deserializeExportDocument(serializeExportDocument(doc)).tags[0].uid).toBe(validTags[0].uid);
  });

  it('generates the standardized filename', () => {
    expect(generateExportFilename(new Date(2026, 8, 7, 12, 34, 56))).toBe('nfcweb-tags-v1-20260907-123456.json');
  });

  it('rejects invalid timestamp and record invariants rather than silently repairing them', () => {
    expect(() => buildTagRegistryExportV1([{ ...validTags[0], firstSeen: 2000, lastRead: 1000 }], '1.0.70')).toThrow(/timestamp invariant/);
    expect(() => buildTagRegistryExportV1([{ ...validTags[0], firstSeen: NaN }], '1.0.70')).toThrow(/invalid firstSeen timestamp/);
    expect(() => buildTagRegistryExportV1([{ ...validTags[0], records: [{ id: 'm', recordType: 'mime', data: 'x', mediaType: '' }] }], '1.0.70')).toThrow(/missing required mediaType/);
    expect(() => buildTagRegistryExportV1([{ ...validTags[0], records: [{ id: '', recordType: 'text', data: 'x' }] }], '1.0.70')).toThrow(/missing required id/);
  });

  it('excludes local photo references from canonical export', () => {
    const doc = buildTagRegistryExportV1([{ ...validTags[0], photoAssetId: 'photo-local', photoUrl: 'blob:http://localhost/photo' }], '1.0.70');
    const json = serializeExportDocument(doc);
    expect(json).not.toContain('photoAssetId');
    expect(json).not.toContain('photo-local');
    expect(validateCanonicalExportDocument(doc).isValid).toBe(true);
  });
});

describe('ImportPlan merge and replace semantics', () => {
  const localTags: NFCTagItem[] = [
    { uid: '04111111', name: 'Existing 1', firstSeen: 1000, lastRead: 2000, readCount: 2, hasNdef: false, records: [] },
    { uid: '04222222', name: 'Existing 2', firstSeen: 1000, lastRead: 3000, readCount: 4, hasNdef: true, records: [{ id: 'r1', recordType: 'text', data: 'Old' }] }
  ];
  const incoming: TagRegistryExportDocumentV1 = {
    format: CANONICAL_FORMAT,
    schemaVersion: 1,
    exportedAt: '2026-09-07T12:00:00.000Z',
    appVersion: '1.0.70',
    tags: [
      { uid: '04222222', name: 'Updated 2', firstSeen: 1000, lastRead: 6000, readCount: 8, hasNdef: true, records: [{ id: 'r2', recordType: 'url', data: 'https://updated.com' }] },
      { uid: '04333333', name: 'New 3', firstSeen: 5000, lastRead: 5000, readCount: 1, hasNdef: false, records: [] }
    ]
  };

  it('merge adds, updates and preserves untouched local tags', () => {
    const plan = buildImportPlan(incoming, localTags, 'merge');
    expect(plan.newCount).toBe(1);
    expect(plan.updateCount).toBe(1);
    expect(plan.removedCount).toBe(0);
    const result = applyImportPlan(plan);
    expect(result).toHaveLength(3);
    expect(result.find(tag => tag.uid === '04111111')?.name).toBe('Existing 1');
    expect(result.find(tag => tag.uid === '04222222')?.name).toBe('Updated 2');
  });

  it('replace retains only imported tags', () => {
    const plan = buildImportPlan(incoming, localTags, 'replace');
    expect(plan.removedCount).toBe(1);
    expect(applyImportPlan(plan).map(tag => tag.uid).sort()).toEqual(['04222222', '04333333']);
  });

  it('identifies unchanged tags', () => {
    const identical: TagRegistryExportDocumentV1 = {
      format: CANONICAL_FORMAT,
      schemaVersion: 1,
      exportedAt: '2026-09-07T12:00:00.000Z',
      appVersion: '1.0.70',
      tags: [{ uid: '04111111', name: 'Existing 1', firstSeen: 1000, lastRead: 2000, readCount: 2, hasNdef: false, records: [] }]
    };
    const plan = buildImportPlan(identical, localTags, 'merge');
    expect(plan.unchangedCount).toBe(1);
    expect(plan.updateCount).toBe(0);
  });

  it('merge preserves local photo fields on matching UID', () => {
    const local: NFCTagItem[] = [{
      uid: '04112233445566',
      name: 'Local',
      firstSeen: 1000,
      lastRead: 2000,
      readCount: 1,
      hasNdef: false,
      records: [],
      photoAssetId: 'photo-local',
      photoUrl: 'https://example.com/local.jpg'
    }];
    const doc: TagRegistryExportDocumentV1 = {
      format: CANONICAL_FORMAT,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      exportedAt: '2026-09-07T12:00:00.000Z',
      appVersion: '1.0.70',
      tags: [{ uid: '04112233445566', name: 'Imported', firstSeen: 1000, lastRead: 3000, readCount: 2, hasNdef: false, records: [] }]
    };
    const result = applyImportPlan(buildImportPlan(doc, local, 'merge'));
    expect(result[0].name).toBe('Imported');
    expect(result[0].photoAssetId).toBe('photo-local');
    expect(result[0].photoUrl).toBe('https://example.com/local.jpg');
  });
});
