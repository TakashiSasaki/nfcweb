import { describe, it, expect } from 'vitest';
import { 
  buildTagRegistryExportV1, 
  serializeExportDocument, 
  generateExportFilename 
} from './export';
import { validateImportPayload } from './validate';
import { 
  applyMerge, 
  applyReplace, 
  calculatePreflightStats, 
  convertExportableToLocal 
} from './merge';
import { EXAMPLE_TAG_REGISTRY_V1 } from './example';
import registrySchema from './nfcweb-tag-registry.schema.json';
import { NFCTagItem } from '../types';
import { NfcwebTagRegistryExportV1 } from './types';

describe('Canonical JSON Schema & Example', () => {
  it('validates canonical example export document against schema', () => {
    const result = validateImportPayload(EXAMPLE_TAG_REGISTRY_V1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.format).toBe('nfcweb-tag-registry');
      expect(result.document.schemaVersion).toBe(1);
      expect(result.document.tags.length).toBe(3);
    }
  });

  it('verifies that the schema and example are serializable JSON', () => {
    const schemaStr = JSON.stringify(registrySchema);
    expect(schemaStr).toContain('nfcweb-tag-registry');
    const exampleStr = JSON.stringify(EXAMPLE_TAG_REGISTRY_V1);
    expect(exampleStr).toContain('04:5a:b2:3c:9d:80:01');
  });
});

describe('Export Implementation', () => {
  const mockTags: NFCTagItem[] = [
    {
      uid: '04:11:22:33:44:55:66',
      name: 'Asset Tag Alpha',
      firstSeen: 1788700000000,
      lastRead: 1788750000000,
      readCount: 7,
      lastAction: 'read',
      tagType: 'NTAG215 (504B)',
      hasNdef: true,
      notes: 'Storage Room 3',
      isSample: false,
      records: [
        {
          id: 'rec-1',
          recordType: 'url',
          data: 'https://example.com/asset/alpha'
        },
        {
          id: 'rec-2',
          recordType: 'text',
          data: 'Alpha Device',
          lang: 'ja',
          encoding: 'utf-8'
        },
        {
          id: 'rec-3',
          recordType: 'mime',
          mediaType: 'application/json',
          data: '{"status":"active"}'
        },
        {
          id: 'rec-4',
          recordType: 'empty',
          data: ''
        }
      ]
    }
  ];

  it('builds a canonical v1 export document preserving all meaningful tag data', () => {
    const doc = buildTagRegistryExportV1(mockTags, '1.0.50', new Date('2026-09-07T12:00:00.000Z'));
    expect(doc.format).toBe('nfcweb-tag-registry');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.appVersion).toBe('1.0.50');
    expect(doc.exportedAt).toBe('2026-09-07T12:00:00.000Z');
    expect(doc.tags.length).toBe(1);

    const tag = doc.tags[0];
    expect(tag.uid).toBe('04:11:22:33:44:55:66');
    expect(tag.name).toBe('Asset Tag Alpha');
    expect(tag.firstSeen).toBe(1788700000000);
    expect(tag.lastRead).toBe(1788750000000);
    expect(tag.readCount).toBe(7);
    expect(tag.lastAction).toBe('read');
    expect(tag.tagType).toBe('NTAG215 (504B)');
    expect(tag.hasNdef).toBe(true);
    expect(tag.notes).toBe('Storage Room 3');
    expect(tag.isSample).toBe(false);

    expect(tag.records.length).toBe(4);
    expect(tag.records[0].recordType).toBe('url');
    expect(tag.records[1].lang).toBe('ja');
    expect(tag.records[2].mediaType).toBe('application/json');
    expect(tag.records[3].recordType).toBe('empty');
  });

  it('generates deterministic filename with pattern nfcweb-tags-v1-YYYYMMDD-HHmmss.json', () => {
    const filename = generateExportFilename(new Date(2026, 8, 7, 14, 30, 45)); // Month is 0-indexed: 8 = Sept
    expect(filename).toBe('nfcweb-tags-v1-20260907-143045.json');
  });

  it('round-trips export -> serialize -> parse -> validate cleanly preserving all fields', () => {
    const exportedDoc = buildTagRegistryExportV1(mockTags, '1.0.50');
    const jsonStr = serializeExportDocument(exportedDoc);
    const parsed = JSON.parse(jsonStr);
    const validResult = validateImportPayload(parsed);

    expect(validResult.ok).toBe(true);
    if (validResult.ok) {
      expect(validResult.document.tags.length).toBe(1);
      const importedTag = validResult.document.tags[0];
      const localConverted = convertExportableToLocal(importedTag);

      expect(localConverted.uid).toBe(mockTags[0].uid);
      expect(localConverted.name).toBe(mockTags[0].name);
      expect(localConverted.readCount).toBe(mockTags[0].readCount);
      expect(localConverted.records.length).toBe(mockTags[0].records.length);
      expect(localConverted.records[2].mediaType).toBe('application/json');
    }
  });
});

describe('Import Validation & Error Rejections', () => {
  it('rejects null or non-object payloads', () => {
    expect(validateImportPayload(null).ok).toBe(false);
    expect(validateImportPayload('invalid string').ok).toBe(false);
    expect(validateImportPayload(123).ok).toBe(false);
  });

  it('rejects wrong format identifier with actionable error', () => {
    const invalid = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      format: 'some-other-format'
    };
    const res = validateImportPayload(invalid);
    expect(res.ok).toBe(false);
    if (!res.ok && res.errors) {
      expect(res.errors[0].message).toContain('Unrecognized format "some-other-format"');
    }
  });

  it('rejects unsupported future schemaVersion with compatibility guidance', () => {
    const futureDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      schemaVersion: 2
    };
    const res = validateImportPayload(futureDoc);
    expect(res.ok).toBe(false);
    if (!res.ok && res.errors) {
      expect(res.errors[0].message).toContain('Unsupported future schema version (2)');
    }
  });

  it('rejects missing or empty UID', () => {
    const invalidDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [
        {
          ...EXAMPLE_TAG_REGISTRY_V1.tags[0],
          uid: ''
        }
      ]
    };
    const res = validateImportPayload(invalidDoc);
    expect(res.ok).toBe(false);
  });

  it('rejects duplicate normalized UIDs within the same import document', () => {
    const docWithDuplicates = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [
        {
          ...EXAMPLE_TAG_REGISTRY_V1.tags[0],
          uid: '04:AA:BB:CC'
        },
        {
          ...EXAMPLE_TAG_REGISTRY_V1.tags[1],
          uid: '04-aa-bb-cc' // Normalized matches!
        }
      ]
    };
    const res = validateImportPayload(docWithDuplicates);
    expect(res.ok).toBe(false);
    if (!res.ok && res.errors) {
      expect(res.errors[0].message).toContain('Ambiguous import: Multiple tags normalize to UID');
    }
  });

  it('rejects invalid nested NDEF record types', () => {
    const invalidRecordDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [
        {
          ...EXAMPLE_TAG_REGISTRY_V1.tags[0],
          records: [
            {
              id: 'rec-bad',
              recordType: 'unsupported-custom-type',
              data: 'test'
            }
          ]
        }
      ]
    };
    const res = validateImportPayload(invalidRecordDoc);
    expect(res.ok).toBe(false);
  });

  it('rejects MIME records missing required mediaType', () => {
    const invalidMimeDoc = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [
        {
          ...EXAMPLE_TAG_REGISTRY_V1.tags[0],
          records: [
            {
              id: 'rec-mime-bad',
              recordType: 'mime',
              data: '{"test":true}'
              // missing mediaType!
            }
          ]
        }
      ]
    };
    const res = validateImportPayload(invalidMimeDoc);
    expect(res.ok).toBe(false);
  });

  it('rejects accidental additionalProperties at top level or tag level', () => {
    const unexpectedTopProp = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      arbitraryHackedField: 'injection'
    };
    expect(validateImportPayload(unexpectedTopProp).ok).toBe(false);

    const unexpectedTagProp = {
      ...EXAMPLE_TAG_REGISTRY_V1,
      tags: [
        {
          ...EXAMPLE_TAG_REGISTRY_V1.tags[0],
          maliciousProperty: 123
        }
      ]
    };
    expect(validateImportPayload(unexpectedTagProp).ok).toBe(false);
  });
});

describe('Legacy Compatibility Importer', () => {
  const legacyRawArray: NFCTagItem[] = [
    {
      uid: '04:99:88:77:66:55:44',
      name: 'Legacy Tag Item',
      firstSeen: 1780000000000,
      lastRead: 1781000000000,
      readCount: 3,
      hasNdef: true,
      records: [
        {
          id: 'rec-leg-1',
          recordType: 'text',
          data: 'Hello Legacy',
          lang: 'ja'
        }
      ]
    }
  ];

  it('detects and converts legacy raw array into normalized canonical v1 format', () => {
    const res = validateImportPayload(legacyRawArray);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.isLegacy).toBe(true);
      expect(res.legacyWarning).toBeDefined();
      expect(res.document.format).toBe('nfcweb-tag-registry');
      expect(res.document.schemaVersion).toBe(1);
      expect(res.document.tags[0].uid).toBe('04:99:88:77:66:55:44');
      expect(res.document.tags[0].records[0].data).toBe('Hello Legacy');
    }
  });

  it('rejects legacy array if items are invalid', () => {
    const badLegacy = [
      {
        uid: '', // empty
        hasNdef: false
      }
    ];
    const res = validateImportPayload(badLegacy);
    expect(res.ok).toBe(false);
  });
});

describe('Deterministic Merge & Replace Semantics', () => {
  const existingLocalTags: NFCTagItem[] = [
    {
      uid: '04:11:11:11',
      name: 'Local Tag 1 (Untouched)',
      firstSeen: 1000,
      lastRead: 2000,
      readCount: 2,
      hasNdef: false,
      records: []
    },
    {
      uid: '04:22:22:22',
      name: 'Local Tag 2 (To be updated)',
      firstSeen: 1000,
      lastRead: 3000,
      readCount: 4,
      hasNdef: true,
      records: [{ id: 'old-rec', recordType: 'text', data: 'Old Data' }]
    }
  ];

  const importedDoc: NfcwebTagRegistryExportV1 = {
    format: 'nfcweb-tag-registry',
    schemaVersion: 1,
    exportedAt: '2026-09-07T00:00:00.000Z',
    appVersion: '1.0.50',
    tags: [
      {
        uid: '04:22:22:22', // Conflict: matches Local Tag 2
        name: 'Imported Tag 2 (Winner)',
        firstSeen: 1000,
        lastRead: 5000,
        readCount: 10,
        hasNdef: true,
        records: [{ id: 'new-rec', recordType: 'url', data: 'https://winner.com' }]
      },
      {
        uid: '04:33:33:33', // New tag
        name: 'Imported Brand New Tag 3',
        firstSeen: 4000,
        lastRead: 6000,
        readCount: 1,
        hasNdef: false,
        records: []
      }
    ]
  };

  it('calculates preflight statistics correctly', () => {
    const stats = calculatePreflightStats(importedDoc, existingLocalTags);
    expect(stats.totalImported).toBe(2);
    expect(stats.newCount).toBe(1); // 04:33:33:33 is new
    expect(stats.conflictCount).toBe(1); // 04:22:22:22 is updated
    expect(stats.unchangedCount).toBe(0);
    expect(stats.currentLocalCount).toBe(2);
    expect(stats.resultingCount).toBe(3); // 2 existing + 1 new = 3
  });

  it('executes Merge: adds new, updates conflicting with imported-wins, preserves untouched local tags', () => {
    const merged = applyMerge(importedDoc.tags, existingLocalTags);

    expect(merged.length).toBe(3);

    // 04:11:11:11 was preserved untouched
    const tag1 = merged.find(t => t.uid === '04:11:11:11');
    expect(tag1).toBeDefined();
    expect(tag1?.name).toBe('Local Tag 1 (Untouched)');

    // 04:22:22:22 was updated: imported data wins
    const tag2 = merged.find(t => t.uid === '04:22:22:22');
    expect(tag2).toBeDefined();
    expect(tag2?.name).toBe('Imported Tag 2 (Winner)');
    expect(tag2?.readCount).toBe(10);
    expect(tag2?.records[0].data).toBe('https://winner.com');

    // 04:33:33:33 was added
    const tag3 = merged.find(t => t.uid === '04:33:33:33');
    expect(tag3).toBeDefined();
    expect(tag3?.name).toBe('Imported Brand New Tag 3');
  });

  it('executes Replace: completely replaces local registry with imported registry only', () => {
    const replaced = applyReplace(importedDoc.tags);
    expect(replaced.length).toBe(2);
    expect(replaced.some(t => t.uid === '04:11:11:11')).toBe(false); // Old untouched is gone
    expect(replaced.some(t => t.uid === '04:22:22:22')).toBe(true);
    expect(replaced.some(t => t.uid === '04:33:33:33')).toBe(true);
  });
});
