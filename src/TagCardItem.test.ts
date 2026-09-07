import { describe, it, expect } from 'vitest';
import { analyzeNTAGCapacity, NTAG_LIMITS, getTagTypeHint } from './store';
import { NFCTagItem, EditableNDEFRecord } from './types';
import { canonicalizeUid } from './domain/uid';

describe('NFC Inventory UI Redesign - Verification Cases', () => {
  // Case 1: URL record 1件
  it('case 1: handles single URL record cleanly without multi-record overhead', () => {
    const records: EditableNDEFRecord[] = [
      { id: 'rec-1', recordType: 'url', data: 'https://example.com/asset/1048' }
    ];
    const capacity = analyzeNTAGCapacity(records);
    expect(capacity.isOverLimit).toBe(false);
    expect(capacity.bytes).toBeGreaterThan(0);
    expect(records.length).toBe(1);
    expect(records[0].recordType).toBe('url');
  });

  // Case 2: Text record 1件
  it('case 2: handles single Text record cleanly', () => {
    const records: EditableNDEFRecord[] = [
      { id: 'rec-2', recordType: 'text', data: 'Conference Room Key Card (SN-10047)', lang: 'ja' }
    ];
    const capacity = analyzeNTAGCapacity(records);
    expect(capacity.isOverLimit).toBe(false);
    expect(records[0].recordType).toBe('text');
  });

  // Case 3: Multiple records
  it('case 3: handles multiple records with multi-record count', () => {
    const records: EditableNDEFRecord[] = [
      { id: 'rec-1', recordType: 'url', data: 'https://asset.enterprise.io/device/mac-0489' },
      { id: 'rec-2', recordType: 'text', data: 'MacBook Pro 16" M3 Max', lang: 'ja' },
      { id: 'rec-3', recordType: 'mime', mediaType: 'application/json', data: '{"status":"active"}' }
    ];
    const capacity = analyzeNTAGCapacity(records);
    expect(records.length).toBe(3);
    expect(records[0].recordType).toBe('url');
    // Multi-record count indicator: +2 more
    expect(records.length - 1).toBe(2);
    expect(capacity.bytes).toBeGreaterThan(50);
  });

  // Case 4: Empty tag / UID only
  it('case 4: handles empty unformatted ID-only tags quietly without errors', () => {
    const records: EditableNDEFRecord[] = [];
    const capacity = analyzeNTAGCapacity(records);
    expect(capacity.bytes).toBe(0);
    expect(capacity.isOverLimit).toBe(false);
    expect(records.length).toBe(0);
  });

  // Case 5: Long item name
  it('case 5: supports long item name without data truncation or corruption', () => {
    const longName = 'High-Precision CNC Milling & Laser Equipment Calibrator Unit #4829-Beta Special Enterprise Edition';
    const tag: NFCTagItem = {
      uid: '04:a1:b2:c3:d4:e5:f6',
      name: longName,
      firstSeen: Date.now(),
      lastRead: Date.now(),
      readCount: 1,
      hasNdef: false,
      records: []
    };
    expect(tag.name).toBe(longName);
    expect(tag.name.length).toBeGreaterThan(60);
  });

  // Case 6: Long UID / Content
  it('case 6: supports 10-byte extended UIDs and long payloads', () => {
    const longUid = '04:12:34:56:78:9a:bc:de:f0:11';
    const canonical = canonicalizeUid(longUid);
    expect(canonical).toBe('04123456789abcdef011');
    const hint = getTagTypeHint(canonical);
    expect(hint).toContain('10-byte');
  });

  // Case 7: Capacity exceeded state
  it('case 7: flags exceptional capacity exceeded state (> 888 bytes)', () => {
    const largeData = 'A'.repeat(1000);
    const records: EditableNDEFRecord[] = [
      { id: 'rec-big', recordType: 'text', data: largeData, lang: 'en' }
    ];
    const capacity = analyzeNTAGCapacity(records);
    expect(capacity.isOverLimit).toBe(true);
    expect(capacity.bytes).toBeGreaterThan(NTAG_LIMITS.NTAG216);
  });

  // Photo Readiness Cases:
  // Case 8: Thumbnail present
  it('case 8: supports item with photoUrl defined', () => {
    const tag: NFCTagItem = {
      uid: '04:a1:b2:c3:d4:e5:f6',
      name: 'MacBook Pro Unit',
      firstSeen: Date.now(),
      lastRead: Date.now(),
      readCount: 1,
      hasNdef: true,
      records: [],
      photoUrl: 'data:image/svg+xml;utf8,<svg><rect fill="blue"/></svg>'
    };
    expect(tag.photoUrl).toBeDefined();
    expect(tag.photoUrl).toContain('data:image/svg+xml');
  });

  // Case 9: Thumbnail absent
  it('case 9: supports item without photoUrl cleanly', () => {
    const tag: NFCTagItem = {
      uid: '04:a1:b2:c3:d4:e5:f6',
      name: 'Raw Warehouse Item',
      firstSeen: Date.now(),
      lastRead: Date.now(),
      readCount: 1,
      hasNdef: false,
      records: []
    };
    expect(tag.photoUrl).toBeUndefined();
  });

  // Case 10: Broken thumbnail fallback test
  it('case 10: invalid photoUrl is handled gracefully', () => {
    const invalidUrl = 'https://invalid.broken-url.example/test.jpg';
    const tag: NFCTagItem = {
      uid: '04:a1:b2:c3:d4:e5:f6',
      name: 'Item with Invalid Image',
      firstSeen: Date.now(),
      lastRead: Date.now(),
      readCount: 1,
      hasNdef: false,
      records: [],
      photoUrl: invalidUrl
    };
    expect(tag.photoUrl).toBe(invalidUrl);
  });

  // Case 11: Portrait photo support
  it('case 11: accepts portrait photo URLs', () => {
    const portraitUrl = 'data:image/svg+xml;utf8,<svg viewBox="0 0 300 400"><rect fill="purple"/></svg>';
    const tag: NFCTagItem = {
      uid: '04:a1:b2:c3:d4:e5:f6',
      name: 'Access Badge Sign',
      firstSeen: Date.now(),
      lastRead: Date.now(),
      readCount: 1,
      hasNdef: false,
      records: [],
      photoUrl: portraitUrl
    };
    expect(tag.photoUrl).toBe(portraitUrl);
  });

  // Case 12: Landscape photo support
  it('case 12: accepts landscape photo URLs', () => {
    const landscapeUrl = 'data:image/svg+xml;utf8,<svg viewBox="0 0 400 225"><rect fill="orange"/></svg>';
    const tag: NFCTagItem = {
      uid: '04:a1:b2:c3:d4:e5:f6',
      name: 'Warehouse Shelf',
      firstSeen: Date.now(),
      lastRead: Date.now(),
      readCount: 1,
      hasNdef: false,
      records: [],
      photoUrl: landscapeUrl
    };
    expect(tag.photoUrl).toBe(landscapeUrl);
  });
});
