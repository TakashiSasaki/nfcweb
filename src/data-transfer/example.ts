import { NfcwebTagRegistryExportV1 } from './types';

export const EXAMPLE_TAG_REGISTRY_V1: NfcwebTagRegistryExportV1 = {
  format: 'nfcweb-tag-registry',
  schemaVersion: 1,
  exportedAt: '2026-09-07T01:23:45.678Z',
  appVersion: '1.0.50',
  tags: [
    {
      uid: '04:5a:b2:3c:9d:80:01',
      name: 'Smart Asset Tag #1',
      firstSeen: 1788744000000,
      lastRead: 1788747600000,
      readCount: 5,
      lastAction: 'read',
      tagType: 'NTAG215 (504B)',
      hasNdef: true,
      notes: 'Smart office equipment tag',
      isSample: false,
      records: [
        {
          id: 'rec-url-1',
          recordType: 'url',
          data: 'https://asset.enterprise.io/device/mac-0489'
        },
        {
          id: 'rec-txt-1',
          recordType: 'text',
          data: 'MacBook Pro 16" M3 Max (IT-Asset-8492)',
          lang: 'ja'
        },
        {
          id: 'rec-mime-1',
          recordType: 'mime',
          mediaType: 'application/json',
          data: '{"owner":"Takashi","dept":"Engineering","status":"active"}'
        }
      ]
    },
    {
      uid: '04:88:1f:6a:22:90:02',
      name: 'Meeting Room Wi-Fi Key',
      firstSeen: 1788740000000,
      lastRead: 1788745000000,
      readCount: 12,
      lastAction: 'write',
      tagType: 'NTAG213 / MIFARE Ultralight (7-byte UID)',
      hasNdef: true,
      records: [
        {
          id: 'rec-wifi-1',
          recordType: 'text',
          data: 'WIFI:S:Office_Guest_5G;T:WPA;P:Welcome2026!;;',
          lang: 'en'
        }
      ]
    },
    {
      uid: '01:2e:3d:4c:5b:6a:7b:8c',
      name: 'Raw FeliCa Transit Key',
      firstSeen: 1788730000000,
      lastRead: 1788730000000,
      readCount: 1,
      lastAction: 'read',
      tagType: 'FeliCa / ISO 15693 (8-byte IDm/UID)',
      hasNdef: false,
      records: []
    }
  ]
};
