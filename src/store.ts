import { useState, useEffect, useCallback, useRef } from 'react';
import { NFCLog, NFCSettings, NFCTagItem, EditableNDEFRecord, PhotoUpdate } from './types';
import { normalizeUid, canonicalizeUid, isValidCanonicalUid } from './domain/uid';
import { getAllTags, sanitizeTag } from './storage/tagRepository';
import {
  upsertTagTransactional,
  patchTagTransactional,
  updateTagPhotoTransactional,
  deleteTagTransactional,
  clearAllTagsTransactional,
  importRegistryTransactional,
  replaceTagRegistryTransactional
} from './storage/transactionalOperations';
import { enqueueTagMutation } from './storage/tagMutationQueue';

export { normalizeUid, canonicalizeUid, isValidCanonicalUid };

const defaultSettings: NFCSettings = { vibrateOnScan: true };

export const NTAG_LIMITS = {
  NTAG213: 144,
  NTAG215: 504,
  NTAG216: 888
} as const;

export interface NTAGCapacityAnalysis {
  bytes: number;
  fitsNTAG213: boolean;
  fitsNTAG215: boolean;
  fitsNTAG216: boolean;
  isOverLimit: boolean;
  recommendedChip: 'NTAG213' | 'NTAG215' | 'NTAG216' | 'OVER_LIMIT';
  percentageNTAG213: number;
  percentageNTAG215: number;
  percentageNTAG216: number;
  badgeLabel: string;
  badgeColor: 'emerald' | 'amber' | 'blue' | 'red';
  detailDescription: string;
}

export function calculateNDEFByteSize(records: EditableNDEFRecord[]): number {
  if (!records || records.length === 0) return 0;
  const textEncoder = new TextEncoder();
  let totalBytes = 0;
  let activeRecordsCount = 0;

  for (const record of records) {
    if (record.recordType === 'empty') continue;
    activeRecordsCount++;
    if (record.recordType === 'text') {
      const textUtf8Bytes = textEncoder.encode(record.data || '').length;
      const langBytes = textEncoder.encode(record.lang || 'en').length;
      totalBytes += 5 + langBytes + textUtf8Bytes;
    } else if (record.recordType === 'url') {
      let urlStr = record.data || '';
      if (urlStr.startsWith('https://')) urlStr = urlStr.slice(8);
      else if (urlStr.startsWith('http://')) urlStr = urlStr.slice(7);
      totalBytes += 5 + textEncoder.encode(urlStr).length;
    } else if (record.recordType === 'mime') {
      const mediaTypeBytes = textEncoder.encode(record.mediaType || 'application/json').length;
      const dataBytes = textEncoder.encode(record.data || '').length;
      totalBytes += 3 + mediaTypeBytes + dataBytes;
    }
  }

  if (activeRecordsCount === 0) return 0;
  return totalBytes + (totalBytes > 254 ? 5 : 3);
}

export function analyzeNTAGCapacity(bytesOrRecords: number | EditableNDEFRecord[]): NTAGCapacityAnalysis {
  const bytes = typeof bytesOrRecords === 'number' ? bytesOrRecords : calculateNDEFByteSize(bytesOrRecords);
  const fitsNTAG213 = bytes <= NTAG_LIMITS.NTAG213;
  const fitsNTAG215 = bytes <= NTAG_LIMITS.NTAG215;
  const fitsNTAG216 = bytes <= NTAG_LIMITS.NTAG216;
  const isOverLimit = bytes > NTAG_LIMITS.NTAG216;

  let recommendedChip: 'NTAG213' | 'NTAG215' | 'NTAG216' | 'OVER_LIMIT' = 'NTAG213';
  let badgeLabel = '';
  let badgeColor: 'emerald' | 'amber' | 'blue' | 'red' = 'emerald';
  let detailDescription = '';

  if (bytes === 0) {
    badgeLabel = '0 B (Empty)';
    detailDescription = 'Empty data (0 Bytes) - writable to all NTAG chips';
  } else if (fitsNTAG213) {
    badgeLabel = `${bytes}B (NTAG213 OK)`;
    detailDescription = `Fits NTAG213 / 215 / 216 (${bytes} / 144 B)`;
  } else if (fitsNTAG215) {
    recommendedChip = 'NTAG215';
    badgeLabel = `${bytes}B (NTAG215 Req)`;
    badgeColor = 'amber';
    detailDescription = `Exceeds 144B: Requires NTAG215 (504B) or NTAG216 (${bytes} / 504 B)`;
  } else if (fitsNTAG216) {
    recommendedChip = 'NTAG216';
    badgeLabel = `${bytes}B (NTAG216 Req)`;
    badgeColor = 'blue';
    detailDescription = `Exceeds 504B: Requires NTAG216 (888B) (${bytes} / 888 B)`;
  } else {
    recommendedChip = 'OVER_LIMIT';
    badgeLabel = `${bytes}B (888B Exceeded)`;
    badgeColor = 'red';
    detailDescription = `Exceeds 888B (${bytes} B): Exceeds standard NTAG216 capacity`;
  }

  return {
    bytes,
    fitsNTAG213,
    fitsNTAG215,
    fitsNTAG216,
    isOverLimit,
    recommendedChip,
    percentageNTAG213: Math.min(100, Math.round((bytes / NTAG_LIMITS.NTAG213) * 100)),
    percentageNTAG215: Math.min(100, Math.round((bytes / NTAG_LIMITS.NTAG215) * 100)),
    percentageNTAG216: Math.min(100, Math.round((bytes / NTAG_LIMITS.NTAG216) * 100)),
    badgeLabel,
    badgeColor,
    detailDescription
  };
}

export function getTagTypeHint(serialNumber?: string): string {
  if (!serialNumber) return 'Standard NFC Tag';
  const clean = serialNumber.replace(/[:-]/g, '');
  const byteCount = Math.round(clean.length / 2);
  if (byteCount === 7) return 'NTAG / MIFARE Ultralight (7-byte UID)';
  if (byteCount === 4) return 'MIFARE Classic / Standard (4-byte UID)';
  if (byteCount === 8) return 'FeliCa / ISO 15693 (8-byte IDm/UID)';
  if (byteCount === 10) return 'Extended NFC (10-byte UID)';
  return `${byteCount}-byte UID NFC Tag`;
}

export function parseRawNDEFToEditable(records: any[]): EditableNDEFRecord[] {
  if (!records || records.length === 0) return [];
  return records.map((record, index) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `rec-${Date.now()}-${index}`;
    const recordType = record.recordType || 'unknown';
    try {
      if (recordType === 'text') {
        const text = new TextDecoder(record.encoding || 'utf-8').decode(record.data);
        return { id, recordType: 'text', data: text, lang: record.lang || 'en' };
      }
      if (recordType === 'url') {
        return { id, recordType: 'url', data: new TextDecoder().decode(record.data) };
      }
      if (recordType === 'mime') {
        return { id, recordType: 'mime', mediaType: record.mediaType || 'application/json', data: new TextDecoder().decode(record.data) };
      }
      if (recordType === 'empty') return { id, recordType: 'empty', data: '' };
      if (record.data) {
        return { id, recordType: 'mime', mediaType: 'application/octet-stream', data: new TextDecoder().decode(record.data) };
      }
    } catch (err) {
      console.warn('NDEF record decode fallback:', err);
    }
    return { id, recordType: 'mime', mediaType: 'application/octet-stream', data: '<Raw Unparsed Data>' };
  });
}

export function formatNDEFPayloadForNFC(records: EditableNDEFRecord[]) {
  const active = records.filter(r => r.recordType !== 'empty');
  if (active.length === 0) return { records: [{ recordType: 'empty' }] };
  return {
    records: active.map(r => {
      if (r.recordType === 'text') return { recordType: 'text', data: r.data || '', lang: r.lang || 'en', encoding: 'utf-8' };
      if (r.recordType === 'url') return { recordType: 'url', data: r.data || '' };
      if (r.recordType === 'mime') return { recordType: 'mime', mediaType: r.mediaType || 'application/json', data: r.data || '' };
      return { recordType: 'text', data: r.data || '', lang: 'en' };
    })
  };
}

export interface SampleTagTemplate {
  id: string;
  name: string;
  category: 'multi' | 'single' | 'empty';
  badge: string;
  description: string;
  records: EditableNDEFRecord[];
}

export const SAMPLE_NDEF_TEMPLATES: SampleTagTemplate[] = [
  {
    id: 'multi-asset',
    name: 'Smart Asset Tag (Multi 3-Rec)',
    category: 'multi',
    badge: '3 Records',
    description: 'URL Portal + Asset Name Text + Hardware Spec JSON MIME',
    records: [
      { id: 'rec-1', recordType: 'url', data: 'https://asset.enterprise.io/device/mac-0489' },
      { id: 'rec-2', recordType: 'text', data: 'MacBook Pro 16" M3 Max (IT-Asset-8492)', lang: 'en' },
      { id: 'rec-3', recordType: 'mime', mediaType: 'application/json', data: '{"owner":"Takashi","dept":"Engineering","status":"active","warrantyExp":"2027-12"}' }
    ]
  },
  {
    id: 'multi-bilingual',
    name: 'Bilingual Information Sign (Multi 2-Rec)',
    category: 'multi',
    badge: '2 Records',
    description: 'Primary Room Description + Secondary Room Description',
    records: [
      { id: 'rec-1', recordType: 'text', data: 'Conference Room 1 (Cap: 12, 4K Projector)', lang: 'en' },
      { id: 'rec-2', recordType: 'text', data: 'Executive Boardroom East (Screen & Polycom)', lang: 'en' }
    ]
  },
  {
    id: 'multi-vcard',
    name: 'Digital Business Card (Multi 2-Rec)',
    category: 'multi',
    badge: '2 Records',
    description: 'LinkedIn Profile URL + Contact vCard MIME (RFC CRLF \\r\\n)',
    records: [
      { id: 'rec-1', recordType: 'url', data: 'https://linkedin.com/in/nfc-engineer' },
      { id: 'rec-2', recordType: 'mime', mediaType: 'text/vcard', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Takashi;Dev;;;\r\nFN:Takashi Dev\r\nORG:Tech Solutions Inc.\r\nTEL;TYPE=CELL,VOICE:+81-90-1234-5678\r\nEMAIL;TYPE=WORK:takashi@example.com\r\nURL:https://example.com\r\nEND:VCARD' }
    ]
  },
  {
    id: 'multi-logistics',
    name: 'Warehouse Logistics & Sensor (Multi 3-Rec)',
    category: 'multi',
    badge: '3 Records',
    description: 'Shelf Location + WMS Deep Link + Zone Config JSON',
    records: [
      { id: 'rec-1', recordType: 'text', data: 'Logistics Bay #07 / Rack 3-B', lang: 'en' },
      { id: 'rec-2', recordType: 'url', data: 'https://wms.logistics.io/shelf/07-3B' },
      { id: 'rec-3', recordType: 'mime', mediaType: 'application/json', data: '{"zone":"Cold-A","targetTemp":-20,"skuCount":48}' }
    ]
  },
  {
    id: 'multi-wifi',
    name: 'Wi-Fi & Guest Portal (Multi 2-Rec)',
    category: 'multi',
    badge: '2 Records',
    description: 'Guest Portal Web URL + Wi-Fi Credentials Payload',
    records: [
      { id: 'rec-1', recordType: 'url', data: 'https://wifi-portal.hotel-guest.com/welcome' },
      { id: 'rec-2', recordType: 'text', data: 'WIFI:S:Guest_Network_1;T:WPA;P:Welcome2026!;;', lang: 'en' }
    ]
  },
  {
    id: 'single-url',
    name: 'Single Website URL (Single 1-Rec)',
    category: 'single',
    badge: '1 Record',
    description: 'Standard Web Link / Landing Page',
    records: [{ id: 'rec-1', recordType: 'url', data: 'https://example.com/nfc-product' }]
  },
  {
    id: 'single-text',
    name: 'Single Plain Text (Single 1-Rec)',
    category: 'single',
    badge: '1 Record',
    description: 'Simple Plain Text Message',
    records: [{ id: 'rec-1', recordType: 'text', data: 'Hello from Web NFC Tag!', lang: 'en' }]
  }
];

export function useAppStore() {
  const [tags, setTags] = useState<NFCTagItem[]>([]);
  const [isHydrated, setIsHydrated] = useState<boolean>(false);
  const tagsRef = useRef<NFCTagItem[]>([]);
  tagsRef.current = tags;

  const [logs, setLogs] = useState<NFCLog[]>(() => {
    try {
      const saved = localStorage.getItem('nfc_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [settings, setSettings] = useState<NFCSettings>(() => {
    try {
      const saved = localStorage.getItem('nfc_settings');
      return saved ? JSON.parse(saved) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const openSearchModal = useCallback(() => setIsSearchModalOpen(true), []);
  const closeSearchModal = useCallback(() => setIsSearchModalOpen(false), []);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    getAllTags()
      .then(dbTags => {
        if (isMounted) setTags(dbTags);
      })
      .catch(err => console.error('Failed to hydrate tags from IndexedDB:', err))
      .finally(() => {
        if (isMounted) setIsHydrated(true);
      });
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('nfc_logs', JSON.stringify(logs.slice(0, 500)));
    } catch (e) {
      console.warn('localStorage quota warning for logs:', e);
    }
  }, [logs]);

  useEffect(() => {
    try {
      localStorage.setItem('nfc_settings', JSON.stringify(settings));
    } catch (e) {
      console.warn('localStorage quota warning for settings:', e);
    }
  }, [settings]);

  const upsertTag = useCallback(async (params: {
    uid: string;
    records?: EditableNDEFRecord[];
    hasNdef?: boolean;
    tagType?: string;
    action?: 'read' | 'write' | 'erase';
    name?: string;
  }): Promise<{ success: boolean; item?: NFCTagItem; error?: string }> => {
    const canonicalUid = canonicalizeUid(params.uid);
    if (!canonicalUid) return { success: false, error: 'Invalid UID' };

    return enqueueTagMutation(canonicalUid, async () => {
      try {
        const updatedItem = await upsertTagTransactional({
          ...params,
          uid: canonicalUid,
          action: params.action ?? 'read',
          tagType: params.tagType || getTagTypeHint(canonicalUid)
        });
        setTags(prev => [updatedItem, ...prev.filter(t => canonicalizeUid(t.uid) !== canonicalUid)]);
        return { success: true, item: updatedItem };
      } catch (err: any) {
        console.error('Failed to upsert tag in IndexedDB:', err);
        return { success: false, error: err?.message || 'Failed to save tag to IndexedDB' };
      }
    });
  }, []);

  const updateTagName = useCallback(async (uid: string, name: string): Promise<{ success: boolean; error?: string }> => {
    const canon = canonicalizeUid(uid);
    if (!canon) return { success: false, error: 'Invalid UID' };
    return enqueueTagMutation(canon, async () => {
      try {
        const updated = await patchTagTransactional(canon, { name });
        setTags(prev => prev.map(t => canonicalizeUid(t.uid) === canon ? updated : t));
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to update tag name' };
      }
    });
  }, []);

  const updateTagNotes = useCallback(async (uid: string, notes: string): Promise<{ success: boolean; error?: string }> => {
    const canon = canonicalizeUid(uid);
    if (!canon) return { success: false, error: 'Invalid UID' };
    return enqueueTagMutation(canon, async () => {
      try {
        const updated = await patchTagTransactional(canon, { notes });
        setTags(prev => prev.map(t => canonicalizeUid(t.uid) === canon ? updated : t));
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to update tag notes' };
      }
    });
  }, []);

  const updateTagPhoto = useCallback(async (
    uid: string,
    update: PhotoUpdate
  ): Promise<{ success: boolean; error?: string }> => {
    const canon = canonicalizeUid(uid);
    if (!canon) return { success: false, error: 'Invalid UID' };
    return enqueueTagMutation(canon, async () => {
      const result = await updateTagPhotoTransactional(canon, update);
      if (!result.success || !result.tag) {
        return { success: false, error: result.error || 'Failed to update item photo' };
      }
      setTags(prev => prev.map(t => canonicalizeUid(t.uid) === canon ? result.tag! : t));
      return { success: true };
    });
  }, []);

  const deleteTag = useCallback(async (uid: string): Promise<{ success: boolean; error?: string }> => {
    const canon = canonicalizeUid(uid);
    if (!canon) return { success: false, error: 'Invalid UID' };
    return enqueueTagMutation(canon, async () => {
      try {
        await deleteTagTransactional(canon);
        setTags(prev => prev.filter(t => canonicalizeUid(t.uid) !== canon));
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Failed to delete tag' };
      }
    });
  }, []);

  const clearAllTags = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      await clearAllTagsTransactional();
      setTags([]);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to clear tags' };
    }
  }, []);

  const importTagsRegistry = useCallback(async (
    newTags: NFCTagItem[],
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<{ success: boolean; error?: string }> => {
    const sanitized = newTags.map(sanitizeTag);
    const result = await importRegistryTransactional(sanitized, mode);
    if (!result.success) return { success: false, error: result.error || 'Failed to import tags' };

    if (mode === 'replace') {
      setTags([...sanitized].sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0)));
    } else {
      setTags(prev => {
        const map = new Map<string, NFCTagItem>();
        for (const t of prev) map.set(canonicalizeUid(t.uid), t);
        for (const t of sanitized) {
          const canon = canonicalizeUid(t.uid);
          const existing = map.get(canon);
          map.set(canon, existing ? {
            ...t,
            photoAssetId: existing.photoAssetId ?? t.photoAssetId,
            photoUrl: existing.photoUrl ?? t.photoUrl
          } : t);
        }
        return Array.from(map.values()).sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
      });
    }
    return { success: true };
  }, []);

  const isLegacyOrTaggedSample = (t: NFCTagItem) => {
    if (t.isSample) return true;
    if (t.notes && (t.notes.includes('sample') || t.notes.includes('Multi-record sample') || t.notes.includes('Unformatted / ID-only hardware tag'))) return true;
    if (t.name && (
      t.name.startsWith('Office Asset Tag') ||
      t.name.startsWith('Conference Room Smart Sign') ||
      t.name.startsWith('Digital Namecard') ||
      t.name.startsWith('Warehouse Shelf Tag') ||
      t.name.startsWith('Guest Wi-Fi Smart Point') ||
      t.name.startsWith('Device Unit ') ||
      t.name.startsWith('Raw ID Tag ')
    )) return true;
    return false;
  };

  const clearSampleTags = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const nonSampleTags = tagsRef.current.filter(t => !isLegacyOrTaggedSample(t));
    const result = await replaceTagRegistryTransactional(nonSampleTags);
    if (!result.success) return { success: false, error: result.error || 'Failed to clear sample tags' };
    setTags(nonSampleTags);
    return { success: true };
  }, []);

  const seedMockTags = useCallback(async (count: number = 50): Promise<{ success: boolean; error?: string }> => {
    const now = Date.now();
    const generated: NFCTagItem[] = [];
    const multiRecordTemplates = [
      {
        name: 'Office Asset Tag',
        tagType: 'NTAG215 (504B)',
        records: (i: number): EditableNDEFRecord[] => [
          { id: `rec-url-${i}`, recordType: 'url', data: `https://asset.enterprise.io/device/${1000 + i}` },
          { id: `rec-txt-${i}`, recordType: 'text', data: `MacBook Pro 16" M3 Max [Dept-Dev-${(i % 5) + 1}]`, lang: 'en' },
          { id: `rec-mim-${i}`, recordType: 'mime', mediaType: 'application/json', data: `{"assetId":"AP-${10000 + i}","assignedTo":"User_${(i % 10) + 1}","status":"active"}` }
        ]
      },
      {
        name: 'Conference Room Smart Sign',
        tagType: 'NTAG213 / MIFARE Ultralight (7-byte UID)',
        records: (i: number): EditableNDEFRecord[] => [
          { id: `rec-ja-${i}`, recordType: 'text', data: `Conference Room ${(i % 8) + 1} (Capacity: 10, 4K Display)`, lang: 'en' },
          { id: `rec-en-${i}`, recordType: 'text', data: `Executive Room ${(i % 8) + 1} (Video Conferencing)`, lang: 'en' }
        ]
      },
      {
        name: 'Digital Namecard (vCard)',
        tagType: 'NTAG215 (504B)',
        records: (i: number): EditableNDEFRecord[] => [
          { id: `rec-url-${i}`, recordType: 'url', data: `https://profile.example.com/staff/${2000 + i}` },
          { id: `rec-vc-${i}`, recordType: 'mime', mediaType: 'text/vcard', data: `BEGIN:VCARD\nVERSION:3.0\nFN:Staff Member ${i + 1}\nTEL:+81-3-1234-${(1000 + i).toString().slice(0, 4)}\nEMAIL:staff${i + 1}@example.com\nEND:VCARD` }
        ]
      },
      {
        name: 'Warehouse Shelf Tag',
        tagType: 'NTAG215 (504B)',
        records: (i: number): EditableNDEFRecord[] => [
          { id: `rec-loc-${i}`, recordType: 'text', data: `Warehouse Bay #0${(i % 9) + 1} / Shelf ${String.fromCharCode(65 + (i % 6))}`, lang: 'en' },
          { id: `rec-url-${i}`, recordType: 'url', data: `https://wms.logistics.io/bay/0${(i % 9) + 1}-${String.fromCharCode(65 + (i % 6))}` },
          { id: `rec-mim-${i}`, recordType: 'mime', mediaType: 'application/json', data: `{"rackId":"RK-${i + 1}","tempZone":"ambient","maxCapacity":120}` }
        ]
      },
      {
        name: 'Guest Wi-Fi Smart Point',
        tagType: 'NTAG213 / MIFARE Ultralight (7-byte UID)',
        records: (i: number): EditableNDEFRecord[] => [
          { id: `rec-url-${i}`, recordType: 'url', data: 'https://guest.connect.hotel/welcome' },
          { id: `rec-wifi-${i}`, recordType: 'text', data: `WIFI:S:Guest_Network_${(i % 3) + 1};T:WPA;P:Pass${2026 + i}!;;`, lang: 'en' }
        ]
      }
    ];
    const singleRecordTexts = [
      'Inventory Item #A-4892',
      'Warehouse Bay 12 Shelf B',
      'Access Badge: Takashi',
      'Door Lock Sensor Office-3F',
      'Exhibition Hall Guide Key'
    ];
    const samplePhotos = [
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231e293b"/><rect x="22" y="24" width="56" height="38" rx="4" fill="%230284c7"/><path d="M14 68 h72 a4 4 0 0 1 4 4 v2 H10 v-2 a4 4 0 0 1 4 -4 z" fill="%2394a3b8"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="75" height="100" viewBox="0 0 75 100"><rect width="75" height="100" fill="%23312e81"/><circle cx="37.5" cy="38" r="18" fill="%23818cf8"/><path d="M15 88 C15 65 60 65 60 88 Z" fill="%23818cf8"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90"><rect width="160" height="90" fill="%231e1b4b"/><rect x="20" y="20" width="120" height="50" rx="6" fill="%23a78bfa"/><circle cx="50" cy="45" r="12" fill="%23c4b5fd"/><rect x="70" y="38" width="50" height="6" rx="2" fill="%23e0e7ff"/><rect x="70" y="48" width="35" height="4" rx="2" fill="%23c4b5fd"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%2378350f"/><path d="M28 72 L65 35 M58 28 L72 42" stroke="%23fbbf24" stroke-width="8" stroke-linecap="round"/></svg>',
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%230f766e"/><circle cx="50" cy="50" r="28" fill="%232dd4bf"/><path d="M42 50 h16 M50 42 v16" stroke="%23042f2e" stroke-width="4" stroke-linecap="round"/></svg>',
      'https://example.invalid/broken-thumbnail-test.jpg'
    ];

    for (let i = 0; i < count; i++) {
      const hexUid = Array.from({ length: 7 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':');
      const timeOffset = (count - i) * 60000;
      const scenario = i % 4;
      const photoUrl = i < samplePhotos.length ? samplePhotos[i] : undefined;
      if (scenario === 0 || scenario === 1) {
        const tpl = multiRecordTemplates[i % multiRecordTemplates.length];
        const recs = tpl.records(i);
        generated.push({
          uid: hexUid,
          name: i === 0 ? 'Office Asset Tag #1: High-Precision CNC Calibrator Unit' : `${tpl.name} #${i + 1}`,
          firstSeen: now - timeOffset - 3600000,
          lastRead: now - timeOffset,
          readCount: Math.floor(Math.random() * 6) + 1,
          lastAction: i % 3 === 0 ? 'write' : 'read',
          tagType: tpl.tagType,
          hasNdef: true,
          records: recs,
          notes: `Multi-record sample (${recs.length} NDEF records)`,
          isSample: true,
          photoUrl
        });
      } else if (scenario === 2) {
        const isUrl = i % 2 === 0;
        generated.push({
          uid: hexUid,
          name: `Device Unit ${i + 1}`,
          firstSeen: now - timeOffset - 3600000,
          lastRead: now - timeOffset,
          readCount: Math.floor(Math.random() * 4) + 1,
          lastAction: 'read',
          tagType: 'NTAG213 / MIFARE Ultralight (7-byte UID)',
          hasNdef: true,
          records: isUrl ? [{ id: `rec-url-${i}`, recordType: 'url', data: `https://example.com/asset/${1000 + i}` }] : [{ id: `rec-txt-${i}`, recordType: 'text', data: `${singleRecordTexts[i % singleRecordTexts.length]} (SN-${10000 + i})`, lang: 'ja' }],
          isSample: true,
          photoUrl
        });
      } else {
        generated.push({
          uid: hexUid,
          name: `Raw ID Tag ${i + 1}`,
          firstSeen: now - timeOffset - 3600000,
          lastRead: now - timeOffset,
          readCount: 1,
          lastAction: 'read',
          tagType: i % 2 === 0 ? 'MIFARE Classic / Standard (4-byte UID)' : 'FeliCa / ISO 15693 (8-byte IDm/UID)',
          hasNdef: false,
          records: [],
          notes: 'Unformatted / ID-only hardware tag',
          isSample: true,
          photoUrl
        });
      }
    }

    const result = await importRegistryTransactional(generated, 'merge');
    if (!result.success) return { success: false, error: result.error || 'Failed to seed sample tags' };
    setTags(prev => {
      const map = new Map<string, NFCTagItem>();
      for (const t of prev) map.set(canonicalizeUid(t.uid), t);
      for (const t of generated) map.set(canonicalizeUid(t.uid), t);
      return Array.from(map.values()).sort((a, b) => (b.lastRead || 0) - (a.lastRead || 0));
    });
    return { success: true };
  }, []);

  const addLog = useCallback((log: Omit<NFCLog, 'id' | 'timestamp'>) => {
    setLogs(prev => [{ ...log, id: crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}`, timestamp: Date.now() }, ...prev]);
  }, []);
  const clearLogs = useCallback(() => setLogs([]), []);
  const deleteLog = useCallback((id: string) => setLogs(prev => prev.filter(l => l.id !== id)), []);

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const scanAbortControllerRef = useRef<AbortController | null>(null);
  const stopScanning = useCallback(() => {
    if (scanAbortControllerRef.current) {
      scanAbortControllerRef.current.abort();
      scanAbortControllerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  const startScanning = useCallback(async (callbacks?: {
    onSuccess?: (title: string, msg: string) => void;
    onWarning?: (title: string, msg: string) => void;
    onInfo?: (title: string, msg: string) => void;
    onError?: (err: any) => void;
  }) => {
    const isWebNFCSupported = typeof window !== 'undefined' && 'NDEFReader' in window;
    if (!isWebNFCSupported) {
      callbacks?.onError?.(new DOMException('Web NFC is not supported in this browser. Use Chrome on Android or PWA mode.', 'NotSupportedError'));
      return;
    }

    stopScanning();
    setIsScanning(true);
    callbacks?.onInfo?.('NFC Scan Started', 'Hold an NFC tag near your device...');

    try {
      scanAbortControllerRef.current = new AbortController();
      const signal = scanAbortControllerRef.current.signal;
      const ndef = new (window as any).NDEFReader();
      await ndef.scan({ signal });

      ndef.onreading = async (event: any) => {
        const { message, serialNumber } = event;
        const tagIdentifier = serialNumber || `tag-${Date.now().toString(16)}`;
        const tagType = getTagTypeHint(serialNumber);
        const parsedRecords = parseRawNDEFToEditable(message?.records || []);
        const hasRecords = parsedRecords.length > 0 && parsedRecords.some(r => r.recordType !== 'empty');
        const persistResult = await upsertTag({
          uid: tagIdentifier,
          records: parsedRecords,
          hasNdef: hasRecords,
          tagType,
          action: 'read'
        });

        addLog({
          action: 'read',
          serialNumber: tagIdentifier,
          messageSummary: hasRecords ? `Scanned ${parsedRecords.length} record(s) from UID: ${tagIdentifier}` : `Scanned UID: ${tagIdentifier} (ID-Only / No NDEF)`,
          rawRecords: parsedRecords
        });
        if (settings.vibrateOnScan && typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate([100, 50, 100]); } catch {}
        }

        if (persistResult.success) {
          callbacks?.onSuccess?.('NFC Tag Scanned', `Card created/updated for UID [${tagIdentifier}]`);
        } else {
          callbacks?.onWarning?.('Tag Read, Registry Save Failed', persistResult.error || `Could not save UID [${tagIdentifier}] locally.`);
        }
        stopScanning();
      };

      ndef.onreadingerror = async (errorEvent: any) => {
        const eventSerial = errorEvent?.serialNumber;
        if (eventSerial) {
          const persistResult = await upsertTag({
            uid: eventSerial,
            records: [],
            hasNdef: false,
            tagType: getTagTypeHint(eventSerial),
            action: 'read'
          });
          addLog({ action: 'read', serialNumber: eventSerial, messageSummary: `Tag Detected (ID Only: ${eventSerial})`, rawRecords: [] });
          callbacks?.onWarning?.(
            persistResult.success ? 'Tag Detected (ID Only)' : 'Tag Detected, Registry Save Failed',
            persistResult.success ? `UID: ${eventSerial}` : (persistResult.error || `UID: ${eventSerial}`)
          );
          stopScanning();
        } else {
          callbacks?.onError?.(new DOMException('Tag was removed too quickly or connection lost during scan', 'NetworkError'));
        }
      };
    } catch (err: any) {
      callbacks?.onError?.(err);
      setIsScanning(false);
    }
  }, [upsertTag, addLog, stopScanning, settings.vibrateOnScan]);

  return {
    tags,
    isHydrated,
    upsertTag,
    updateTagName,
    updateTagNotes,
    updateTagPhoto,
    deleteTag,
    clearAllTags,
    importTagsRegistry,
    seedMockTags,
    clearSampleTags,
    logs,
    addLog,
    clearLogs,
    deleteLog,
    settings,
    setSettings,
    searchQuery,
    setSearchQuery,
    isSearchModalOpen,
    setIsSearchModalOpen,
    openSearchModal,
    closeSearchModal,
    isHeaderVisible,
    setIsHeaderVisible,
    isScanning,
    startScanning,
    stopScanning
  };
}

export type AppStore = ReturnType<typeof useAppStore>;
