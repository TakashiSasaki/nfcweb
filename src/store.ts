import { useState, useEffect, useCallback, useRef } from 'react';
import { NFCLog, NFCSettings, NFCTagItem, EditableNDEFRecord } from './types';

const defaultSettings: NFCSettings = { vibrateOnScan: true };

// NTAG Boundary Constants (bytes)
export const NTAG_LIMITS = {
  NTAG213: 144, // Standard 144 Bytes user memory
  NTAG215: 504, // 504 Bytes user memory (Amiibo standard)
  NTAG216: 888  // 888 Bytes user memory (High capacity)
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

// Calculate NDEF binary encoding size in bytes including Type 2 Tag TLV and Record headers
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
      // Record header (3 bytes) + 'T' (1 byte) + status byte (1 byte) + lang bytes + text payload
      totalBytes += 5 + langBytes + textUtf8Bytes;
    } else if (record.recordType === 'url') {
      // Record header (3 bytes) + 'U' (1 byte) + URI Identifier (1 byte) + URL payload
      let urlStr = record.data || '';
      // Most NFC writers abbreviate http:// (0x03) or https:// (0x04) into 1-byte prefix
      if (urlStr.startsWith('https://')) {
        urlStr = urlStr.slice(8);
      } else if (urlStr.startsWith('http://')) {
        urlStr = urlStr.slice(7);
      }
      const urlUtf8Bytes = textEncoder.encode(urlStr).length;
      totalBytes += 5 + urlUtf8Bytes;
    } else if (record.recordType === 'mime') {
      // Record header (3 bytes) + mediaType bytes + MIME data bytes
      const mediaTypeBytes = textEncoder.encode(record.mediaType || 'application/json').length;
      const dataBytes = textEncoder.encode(record.data || '').length;
      totalBytes += 3 + mediaTypeBytes + dataBytes;
    }
  }

  if (activeRecordsCount === 0) return 0;

  // Add Type 2 Tag TLV wrapper overhead: 0x03 [Len] ... 0xFE (3 bytes)
  const tlvOverhead = totalBytes > 254 ? 5 : 3;
  return totalBytes + tlvOverhead;
}

// Analyze size against NTAG213 (144B), NTAG215 (504B), and NTAG216 (888B) boundaries
export function analyzeNTAGCapacity(bytesOrRecords: number | EditableNDEFRecord[]): NTAGCapacityAnalysis {
  const bytes = typeof bytesOrRecords === 'number' 
    ? bytesOrRecords 
    : calculateNDEFByteSize(bytesOrRecords);

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
    badgeColor = 'emerald';
    detailDescription = '空データ (0 Bytes) - すべてのNTAGで書き込み可能';
  } else if (fitsNTAG213) {
    recommendedChip = 'NTAG213';
    badgeLabel = `${bytes}B (NTAG213 OK)`;
    badgeColor = 'emerald';
    detailDescription = `NTAG213 / 215 / 216 すべて書き込み可能 (${bytes} / 144 B)`;
  } else if (fitsNTAG215) {
    recommendedChip = 'NTAG215';
    badgeLabel = `${bytes}B (NTAG215 要)`;
    badgeColor = 'amber';
    detailDescription = `144B超過: NTAG215 (504B) または NTAG216 が必要 (${bytes} / 504 B)`;
  } else if (fitsNTAG216) {
    recommendedChip = 'NTAG216';
    badgeLabel = `${bytes}B (NTAG216 要)`;
    badgeColor = 'blue';
    detailDescription = `504B超過: NTAG216 (888B) が必要 (${bytes} / 888 B)`;
  } else {
    recommendedChip = 'OVER_LIMIT';
    badgeLabel = `${bytes}B (888B 超過)`;
    badgeColor = 'red';
    detailDescription = `888B超過 (${bytes} B): 一般的なNTAG216の容量を超えています`;
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

// Helper to determine tag type description from UID length
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

// Normalize UID for resilient case/separator-insensitive comparison
export function normalizeUid(uid?: string): string {
  if (!uid) return '';
  return uid.trim().toLowerCase().replace(/[:-]/g, '');
}

// Convert raw Web NFC records into EditableNDEFRecord format
export function parseRawNDEFToEditable(records: any[]): EditableNDEFRecord[] {
  if (!records || records.length === 0) return [];
  return records.map((record, index) => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `rec-${Date.now()}-${index}`;
    const recordType = record.recordType || 'unknown';

    try {
      if (recordType === 'text') {
        const textDecoder = new TextDecoder(record.encoding || 'utf-8');
        const text = textDecoder.decode(record.data);
        return { id, recordType: 'text', data: text, lang: record.lang || 'ja' };
      }
      if (recordType === 'url') {
        const textDecoder = new TextDecoder();
        const url = textDecoder.decode(record.data);
        return { id, recordType: 'url', data: url };
      }
      if (recordType === 'mime') {
        const textDecoder = new TextDecoder();
        const mimeData = textDecoder.decode(record.data);
        return { id, recordType: 'mime', mediaType: record.mediaType || 'application/json', data: mimeData };
      }
      if (recordType === 'empty') {
        return { id, recordType: 'empty', data: '' };
      }
      if (record.data) {
        const textDecoder = new TextDecoder();
        const unknownData = textDecoder.decode(record.data);
        return { id, recordType: 'mime', mediaType: 'application/octet-stream', data: unknownData };
      }
    } catch (err) {
      console.warn('NDEF record decode fallback:', err);
    }
    return { id, recordType: 'mime', mediaType: 'application/octet-stream', data: '<Raw Unparsed Data>' };
  });
}

// Format EditableNDEFRecord list into NDEF write payload for Web NFC API
export function formatNDEFPayloadForNFC(records: EditableNDEFRecord[]) {
  const active = records.filter(r => r.recordType !== 'empty');
  if (active.length === 0) {
    return { records: [{ recordType: 'empty' }] };
  }

  return {
    records: active.map(r => {
      if (r.recordType === 'text') {
        return {
          recordType: 'text',
          data: r.data || '',
          lang: r.lang || 'ja',
          encoding: 'utf-8'
        };
      }
      if (r.recordType === 'url') {
        return {
          recordType: 'url',
          data: r.data || ''
        };
      }
      if (r.recordType === 'mime') {
        return {
          recordType: 'mime',
          mediaType: r.mediaType || 'application/json',
          data: r.data || ''
        };
      }
      return {
        recordType: 'text',
        data: r.data || '',
        lang: 'ja'
      };
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
      { id: 'rec-2', recordType: 'text', data: 'MacBook Pro 16" M3 Max (IT-Asset-8492)', lang: 'ja' },
      { id: 'rec-3', recordType: 'mime', mediaType: 'application/json', data: '{"owner":"Takashi","dept":"Engineering","status":"active","warrantyExp":"2027-12"}' }
    ]
  },
  {
    id: 'multi-bilingual',
    name: 'Bilingual Information Sign (Multi 2-Rec)',
    category: 'multi',
    badge: '2 Records',
    description: 'Japanese Room Description + English Room Description',
    records: [
      { id: 'rec-1', recordType: 'text', data: '第1会議室（定員12名・4Kプロジェクター完備）', lang: 'ja' },
      { id: 'rec-2', recordType: 'text', data: 'Conference Room 1 (Cap: 12, 4K Projector)', lang: 'en' }
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
      { id: 'rec-1', recordType: 'text', data: 'Logistics Bay #07 / Rack 3-B', lang: 'ja' },
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
      { id: 'rec-2', recordType: 'text', data: 'WIFI:S:Guest_5G;T:WPA;P:Welcome2026!;;', lang: 'en' }
    ]
  },
  {
    id: 'single-url',
    name: 'Single Website URL (Single 1-Rec)',
    category: 'single',
    badge: '1 Record',
    description: 'Standard Web Link / Landing Page',
    records: [
      { id: 'rec-1', recordType: 'url', data: 'https://example.com/nfc-product' }
    ]
  },
  {
    id: 'single-text',
    name: 'Single Plain Text (Single 1-Rec)',
    category: 'single',
    badge: '1 Record',
    description: 'Simple Plain Text Message',
    records: [
      { id: 'rec-1', recordType: 'text', data: 'Hello from Web NFC Tag!', lang: 'ja' }
    ]
  }
];

export function useAppStore() {
  // Tags collection keyed/distinguished by UID
  const [tags, setTags] = useState<NFCTagItem[]>(() => {
    try {
      const saved = localStorage.getItem('nfc_tags_registry');
      if (saved) {
        const parsed: NFCTagItem[] = JSON.parse(saved);
        // Ensure sorted by lastRead DESC (most recently read at top)
        return parsed.sort((a, b) => b.lastRead - a.lastRead);
      }
    } catch (e) {
      console.error('Failed to load saved tags registry', e);
    }
    return [];
  });

  const [logs, setLogs] = useState<NFCLog[]>(() => {
    try {
      const saved = localStorage.getItem('nfc_logs');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [settings, setSettings] = useState<NFCSettings>(() => {
    try {
      const saved = localStorage.getItem('nfc_settings');
      return saved ? JSON.parse(saved) : defaultSettings;
    } catch (e) {
      return defaultSettings;
    }
  });

  // Global Search Query and Search Dialog State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearchModalOpen, setIsSearchModalOpen] = useState<boolean>(false);
  const openSearchModal = useCallback(() => setIsSearchModalOpen(true), []);
  const closeSearchModal = useCallback(() => setIsSearchModalOpen(false), []);

  // Global Record Filter state (for header dropdown filter)
  const [recordFilter, setRecordFilter] = useState<'all' | 'multi' | 'single' | 'empty'>('all');

  // Header visibility state (auto-hides on mobile when scrolling down to maximize scroll viewport)
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);

  // Persist tags to localStorage (with error handling in case of storage quota)
  useEffect(() => {
    try {
      localStorage.setItem('nfc_tags_registry', JSON.stringify(tags));
    } catch (e) {
      console.warn('localStorage quota warning for tags:', e);
    }
  }, [tags]);

  useEffect(() => {
    try {
      // Keep most recent 500 logs in local storage
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

  // Record / Update a Tag by UID
  const upsertTag = useCallback((params: {
    uid: string;
    records?: EditableNDEFRecord[];
    hasNdef?: boolean;
    tagType?: string;
    action?: 'read' | 'write' | 'erase';
    name?: string;
  }) => {
    const { uid, records, hasNdef, tagType, action = 'read', name } = params;
    if (!uid || uid === 'Unknown Tag UID') return;

    const now = Date.now();
    const calculatedTagType = tagType || getTagTypeHint(uid);

    setTags(prev => {
      const existingIndex = prev.findIndex(t => t.uid.toLowerCase() === uid.toLowerCase());
      if (existingIndex >= 0) {
        const existing = prev[existingIndex];
        const updatedItem: NFCTagItem = {
          ...existing,
          lastRead: now,
          readCount: (existing.readCount || 1) + 1,
          lastAction: action,
          tagType: calculatedTagType || existing.tagType,
          hasNdef: hasNdef !== undefined ? hasNdef : existing.hasNdef,
          records: records !== undefined ? records : existing.records,
          name: name !== undefined ? name : existing.name
        };
        // Re-order: Move updated tag to the top
        const rest = prev.filter((_, idx) => idx !== existingIndex);
        return [updatedItem, ...rest];
      } else {
        // New tag entry
        const newItem: NFCTagItem = {
          uid,
          name: name || '',
          firstSeen: now,
          lastRead: now,
          readCount: 1,
          lastAction: action,
          tagType: calculatedTagType,
          hasNdef: hasNdef ?? (records && records.length > 0 ? true : false),
          records: records || []
        };
        return [newItem, ...prev];
      }
    });
  }, []);

  const updateTagName = useCallback((uid: string, name: string) => {
    setTags(prev => prev.map(t => t.uid.toLowerCase() === uid.toLowerCase() ? { ...t, name } : t));
  }, []);

  const updateTagNotes = useCallback((uid: string, notes: string) => {
    setTags(prev => prev.map(t => t.uid.toLowerCase() === uid.toLowerCase() ? { ...t, notes } : t));
  }, []);

  const deleteTag = useCallback((uid: string) => {
    setTags(prev => prev.filter(t => t.uid.toLowerCase() !== uid.toLowerCase()));
  }, []);

  const clearAllTags = useCallback(() => {
    setTags([]);
    try {
      localStorage.removeItem('nfc_tags_registry');
      localStorage.removeItem('nfc_connect_tags_v2');
      localStorage.removeItem('nfc_tags');
    } catch (e) {
      console.warn('Failed to clear tags from localStorage', e);
    }
  }, []);

  const importTagsRegistry = useCallback((newTags: NFCTagItem[]): { success: boolean; error?: string } => {
    try {
      // Validate storage quota write before updating React state
      const serialized = JSON.stringify(newTags);
      localStorage.setItem('nfc_tags_registry', serialized);
      setTags(newTags);
      return { success: true };
    } catch (err: any) {
      console.error('Failed to persist imported tags registry:', err);
      return { 
        success: false, 
        error: err?.message || 'ストレージの容量制限(QuotaExceededError)または書き込みエラーが発生しました。' 
      };
    }
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

  const clearSampleTags = useCallback(() => {
    setTags(prev => prev.filter(t => !isLegacyOrTaggedSample(t)));
  }, []);

  // Developer utility to seed mock tags for stress-testing and multi-record validation
  const seedMockTags = useCallback((count: number = 50) => {
    const now = Date.now();
    const generated: NFCTagItem[] = [];

    const multiRecordTemplates = [
      // 1. Smart Asset Tag (3 Records)
      {
        name: 'Office Asset Tag',
        tagType: 'NTAG215 (504B)',
        records: (i: number): EditableNDEFRecord[] => [
          { id: `rec-url-${i}`, recordType: 'url', data: `https://asset.enterprise.io/device/${1000 + i}` },
          { id: `rec-txt-${i}`, recordType: 'text', data: `MacBook Pro 16" M3 Max [Dept-Dev-${(i % 5) + 1}]`, lang: 'ja' },
          { id: `rec-mim-${i}`, recordType: 'mime', mediaType: 'application/json', data: `{"assetId":"AP-${10000 + i}","assignedTo":"User_${(i % 10) + 1}","status":"active"}` }
        ]
      },
      // 2. Bilingual Smart Sign (2 Records)
      {
        name: 'Conference Room Smart Sign',
        tagType: 'NTAG213 / MIFARE Ultralight (7-byte UID)',
        records: (i: number): EditableNDEFRecord[] => [
          { id: `rec-ja-${i}`, recordType: 'text', data: `第${(i % 8) + 1}会議室（定員10名・大型ディスプレイ完備）`, lang: 'ja' },
          { id: `rec-en-${i}`, recordType: 'text', data: `Conference Room ${(i % 8) + 1} (Capacity: 10, 4K Display)`, lang: 'en' }
        ]
      },
      // 3. Digital Business Card / vCard (2 Records)
      {
        name: 'Digital Namecard (vCard)',
        tagType: 'NTAG215 (504B)',
        records: (i: number): EditableNDEFRecord[] => [
          { id: `rec-url-${i}`, recordType: 'url', data: `https://profile.example.com/staff/${2000 + i}` },
          { id: `rec-vc-${i}`, recordType: 'mime', mediaType: 'text/vcard', data: `BEGIN:VCARD\nVERSION:3.0\nFN:Staff Member ${i + 1}\nTEL:+81-3-1234-${(1000 + i).toString().slice(0, 4)}\nEMAIL:staff${i + 1}@example.com\nEND:VCARD` }
        ]
      },
      // 4. Logistics Bay & Telemetry (3 Records)
      {
        name: 'Warehouse Shelf Tag',
        tagType: 'NTAG215 (504B)',
        records: (i: number): EditableNDEFRecord[] => [
          { id: `rec-loc-${i}`, recordType: 'text', data: `Warehouse Bay #0${(i % 9) + 1} / Shelf ${String.fromCharCode(65 + (i % 6))}`, lang: 'ja' },
          { id: `rec-url-${i}`, recordType: 'url', data: `https://wms.logistics.io/bay/0${(i % 9) + 1}-${String.fromCharCode(65 + (i % 6))}` },
          { id: `rec-mim-${i}`, recordType: 'mime', mediaType: 'application/json', data: `{"rackId":"RK-${i + 1}","tempZone":"ambient","maxCapacity":120}` }
        ]
      },
      // 5. Wi-Fi Portal (2 Records)
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

    for (let i = 0; i < count; i++) {
      const hexUid = Array.from({ length: 7 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(':');
      const timeOffset = (count - i) * 60000;
      const scenario = i % 4; // 0, 1 = Multi-record (50%), 2 = Single record (25%), 3 = Empty/ID-Only (25%)

      if (scenario === 0 || scenario === 1) {
        // Multi-Record Sample Tag
        const tpl = multiRecordTemplates[i % multiRecordTemplates.length];
        const recs = tpl.records(i);

        generated.push({
          uid: hexUid,
          name: `${tpl.name} #${i + 1}`,
          firstSeen: now - timeOffset - 3600000,
          lastRead: now - timeOffset,
          readCount: Math.floor(Math.random() * 6) + 1,
          lastAction: i % 3 === 0 ? 'write' : 'read',
          tagType: tpl.tagType,
          hasNdef: true,
          records: recs,
          notes: `Multi-record sample (${recs.length} NDEF records)`,
          isSample: true
        });
      } else if (scenario === 2) {
        // Single Record Sample Tag
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
          records: isUrl ? [
            {
              id: `rec-url-${i}`,
              recordType: 'url',
              data: `https://example.com/asset/${1000 + i}`
            }
          ] : [
            {
              id: `rec-txt-${i}`,
              recordType: 'text',
              data: `${singleRecordTexts[i % singleRecordTexts.length]} (SN-${10000 + i})`,
              lang: 'ja'
            }
          ],
          isSample: true
        });
      } else {
        // Empty / Unformatted ID-Only Tag
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
          isSample: true
        });
      }
    }

    setTags(prev => [...generated, ...prev].sort((a, b) => b.lastRead - a.lastRead));
  }, []);

  const addLog = useCallback((log: Omit<NFCLog, 'id' | 'timestamp'>) => {
    setLogs(prev => [{ ...log, id: crypto.randomUUID ? crypto.randomUUID() : `log-${Date.now()}`, timestamp: Date.now() }, ...prev]);
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);
  const deleteLog = useCallback((id: string) => setLogs(prev => prev.filter(l => l.id !== id)), []);

  // Global Scanning Controller
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

      ndef.onreading = (event: any) => {
        const { message, serialNumber } = event;
        const tagIdentifier = serialNumber || `tag-${Date.now().toString(16)}`;
        const tagType = getTagTypeHint(serialNumber);

        const rawRecords = message?.records || [];
        const parsedRecords = parseRawNDEFToEditable(rawRecords);
        const hasRecords = parsedRecords.length > 0 && parsedRecords.some(r => r.recordType !== 'empty');

        // Upsert into Tag Cards Registry
        upsertTag({
          uid: tagIdentifier,
          records: parsedRecords,
          hasNdef: hasRecords,
          tagType,
          action: 'read'
        });

        addLog({
          action: 'read',
          serialNumber: tagIdentifier,
          messageSummary: hasRecords
            ? `Scanned ${parsedRecords.length} record(s) from UID: ${tagIdentifier}`
            : `Scanned UID: ${tagIdentifier} (ID-Only / No NDEF)`,
          rawRecords: parsedRecords
        });

        if (settings.vibrateOnScan && typeof navigator !== 'undefined' && navigator.vibrate) {
          try { navigator.vibrate([100, 50, 100]); } catch (_) {}
        }

        callbacks?.onSuccess?.('NFC Tag Scanned', `Card created/updated for UID [${tagIdentifier}]`);
        stopScanning();
      };

      ndef.onreadingerror = (errorEvent: any) => {
        const eventSerial = errorEvent?.serialNumber;
        if (eventSerial) {
          const tagType = getTagTypeHint(eventSerial);
          upsertTag({
            uid: eventSerial,
            records: [],
            hasNdef: false,
            tagType,
            action: 'read'
          });

          addLog({
            action: 'read',
            serialNumber: eventSerial,
            messageSummary: `Tag Detected (ID Only: ${eventSerial})`,
            rawRecords: []
          });

          callbacks?.onWarning?.('Tag Detected (ID Only)', `UID: ${eventSerial}`);
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
    upsertTag,
    updateTagName,
    updateTagNotes,
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
    recordFilter,
    setRecordFilter,
    isHeaderVisible,
    setIsHeaderVisible,
    isScanning,
    startScanning,
    stopScanning
  };
}
export type AppStore = ReturnType<typeof useAppStore>;
