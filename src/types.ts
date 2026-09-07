// Web NFC API Types & App Types

export interface NDEFRecord {
  recordType: string;
  mediaType?: string;
  id?: string;
  data?: DataView;
  encoding?: string;
  lang?: string;
  toRecords?: () => NDEFRecord[];
}

export interface NDEFMessage {
  records: NDEFRecord[];
}

export interface NDEFReadingEvent extends Event {
  serialNumber: string;
  message: NDEFMessage;
}

export interface NDEFWriteOptions {
  overwrite?: boolean;
  signal?: AbortSignal;
}

export declare class NDEFReader {
  constructor();
  onreading: (event: NDEFReadingEvent) => void;
  onreadingerror: (event: Event) => void;
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: any, options?: NDEFWriteOptions): Promise<void>;
  makeReadOnly(options?: { signal?: AbortSignal }): Promise<void>;
}

declare global {
  interface Window {
    NDEFReader: typeof NDEFReader;
  }
}

export interface EditableNDEFRecord {
  id: string;
  recordType: 'text' | 'url' | 'mime' | 'empty';
  mediaType?: string;
  data: string;
  lang?: string;
  encoding?: string;
}

export interface NFCLog {
  id: string;
  timestamp: number;
  action: 'read' | 'write' | 'erase' | 'format';
  serialNumber?: string;
  messageSummary: string;
  rawRecords: any[];
}

// Managed unique NFC Tag by UID
export interface NFCTagItem {
  uid: string; // Primary Key (unique identifier)
  name?: string; // Optional user label or custom tag nickname
  firstSeen: number; // First read timestamp
  lastRead: number; // Most recent read timestamp
  readCount: number; // Total reads count
  lastAction?: 'read' | 'write' | 'erase';
  tagType?: string; // e.g. "NTAG213 / MIFARE Ultralight"
  hasNdef: boolean;
  records: EditableNDEFRecord[];
  notes?: string;
  isSample?: boolean; // Distinguishes simulated/mock sample tags from physically scanned tags
  photoUrl?: string; // Optional item photo URL or thumbnail (sample/external)
  photoAssetId?: string; // Optional local item-photo asset ID persisted in IndexedDB
}

export interface NFCSettings {
  vibrateOnScan?: boolean;
}

export interface NormalizedPhotoImage {
  blob: Blob;
  width?: number;
  height?: number;
  mimeType?: string;
  id?: string;
}

/**
 * Explicit photo update instruction.
 * - omitted / undefined: leave field unchanged
 * - null: explicitly clear field
 * - string: set new value
 * - newPhotoAsset: normalized image record to persist in photo_assets within the atomic transaction
 */
export interface PhotoUpdate {
  photoAssetId?: string | null;
  photoUrl?: string | null;
  newPhotoAsset?: NormalizedPhotoImage;
}
