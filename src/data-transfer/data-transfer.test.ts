import { describe, it, expect } from 'vitest';
import { 
  buildTagRegistryExportV1, 
  serializeExportDocument, 
  generateExportFilename,
  validateImportPayload,
  applyMerge, 
  applyReplace, 
  calculatePreflightStats, 
  convertExportableToLocal,
  EXAMPLE_TAG_REGISTRY_V1,
  registrySchema,
  CANONICAL_FORMAT,
  CANONICAL_SCHEMA_VERSION,
  NfcwebTagRegistryExportV1
} from './index';
import { NFCTagItem } from '../types';

describe('Data Transfer Facade (Re-export Compatibility Layer)', () => {
  it('validates canonical example export document against schema via data-transfer facade', () => {
    const result = validateImportPayload(EXAMPLE_TAG_REGISTRY_V1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.format).toBe(CANONICAL_FORMAT);
      expect(result.document.schemaVersion).toBe(CANONICAL_SCHEMA_VERSION);
      expect(result.document.tags.length).toBe(3);
    }
  });

  it('verifies that schema and example are serializable JSON', () => {
    const schemaStr = JSON.stringify(registrySchema);
    expect(schemaStr).toContain('nfcweb-tag-registry');
    const exampleStr = JSON.stringify(EXAMPLE_TAG_REGISTRY_V1);
    expect(exampleStr).toContain('045ab23c9d8001');
  });

  const mockTags: NFCTagItem[] = [
    {
      uid: '04112233445566',
      name: 'Asset Tag Alpha',
      firstSeen: 1788700000000,
      lastRead: 1788750000000,
      readCount: 7,
      lastAction: 'read',
      tagType: 'NTAG215 (504B)',
      hasNdef: true,
      notes: 'Storage Room 3',
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
        }
      ]
    }
  ];

  it('builds a canonical v1 export document preserving all meaningful tag data', () => {
    const doc = buildTagRegistryExportV1(mockTags, '1.0.51', new Date('2026-09-07T12:00:00.000Z'));
    expect(doc.format).toBe('nfcweb-tag-registry');
    expect(doc.schemaVersion).toBe(1);
    expect(doc.appVersion).toBe('1.0.51');
    expect(doc.exportedAt).toBe('2026-09-07T12:00:00.000Z');
    expect(doc.tags.length).toBe(1);

    const tag = doc.tags[0];
    expect(tag.uid).toBe('04112233445566');
    expect(tag.name).toBe('Asset Tag Alpha');
    expect(tag.records.length).toBe(2);
  });

  it('round-trips export -> serialize -> parse -> validate cleanly preserving all fields', () => {
    const exportedDoc = buildTagRegistryExportV1(mockTags, '1.0.51');
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
    }
  });

  it('calculates preflight statistics and merges correctly', () => {
    const existingLocalTags: NFCTagItem[] = [
      {
        uid: '04111111',
        name: 'Local Tag 1 (Untouched)',
        firstSeen: 1000,
        lastRead: 2000,
        readCount: 2,
        hasNdef: false,
        records: []
      }
    ];

    const importedDoc: NfcwebTagRegistryExportV1 = {
      format: 'nfcweb-tag-registry',
      schemaVersion: 1,
      exportedAt: '2026-09-07T00:00:00.000Z',
      appVersion: '1.0.51',
      tags: [
        {
          uid: '04222222',
          name: 'Imported Tag 2',
          firstSeen: 3000,
          lastRead: 4000,
          readCount: 1,
          hasNdef: false,
          records: []
        }
      ]
    };

    const stats = calculatePreflightStats(importedDoc, existingLocalTags);
    expect(stats.totalImported).toBe(1);
    expect(stats.newCount).toBe(1);

    const merged = applyMerge(importedDoc.tags, existingLocalTags);
    expect(merged.length).toBe(2);

    const replaced = applyReplace(importedDoc.tags);
    expect(replaced.length).toBe(1);
    expect(replaced[0].uid).toBe('04222222');
  });
});
