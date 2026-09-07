// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getAllTags, 
  getTagByUid, 
  saveTag, 
  saveAllTags, 
  deleteTag, 
  deleteTags, 
  clearAllTags, 
  replaceTagRegistry, 
  countTags,
  sanitizeTag
} from './tagRepository';
import { resetNfcDbForTesting } from './database';
import { NFCTagItem } from '../types';

describe('Tag Repository (IndexedDB `tags` store)', () => {
  beforeEach(async () => {
    await resetNfcDbForTesting();
  });

  it('saves and retrieves a sanitized tag by canonical UID', async () => {
    const rawTag: NFCTagItem = {
      uid: '04:a1:b2:c3:d4:e5:f6',
      name: 'Test Machine Tag',
      firstSeen: 1000,
      lastRead: 2000,
      readCount: 3,
      hasNdef: true,
      records: [{ id: '1', recordType: 'text', data: 'Hello', lang: 'en' }]
    };

    await saveTag(rawTag);

    const retrieved = await getTagByUid('04A1B2C3D4E5F6');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.uid).toBe('04a1b2c3d4e5f6');
    expect(retrieved?.name).toBe('Test Machine Tag');
    expect(retrieved?.readCount).toBe(3);
  });

  it('returns all tags sorted descending by lastRead timestamp', async () => {
    const tag1: NFCTagItem = {
      uid: '04:11:11:11:11:11:11',
      name: 'Older Tag',
      firstSeen: 1000,
      lastRead: 1000,
      readCount: 1,
      hasNdef: false,
      records: []
    };
    const tag2: NFCTagItem = {
      uid: '04:22:22:22:22:22:22',
      name: 'Newer Tag',
      firstSeen: 1000,
      lastRead: 5000,
      readCount: 2,
      hasNdef: false,
      records: []
    };

    await saveAllTags([tag1, tag2]);

    const all = await getAllTags();
    expect(all.length).toBe(2);
    expect(all[0].uid).toBe('04222222222222');
    expect(all[1].uid).toBe('04111111111111');
  });

  it('deletes a single tag by UID', async () => {
    const tag: NFCTagItem = {
      uid: '04:AA:BB:CC:DD:EE:FF',
      name: 'To Delete',
      firstSeen: 1000,
      lastRead: 1000,
      readCount: 1,
      hasNdef: false,
      records: []
    };

    await saveTag(tag);
    expect(await countTags()).toBe(1);

    await deleteTag('04:AA:BB:CC:DD:EE:FF');
    expect(await countTags()).toBe(0);
    expect(await getTagByUid('04:AA:BB:CC:DD:EE:FF')).toBeNull();
  });

  it('deletes multiple tags in batch', async () => {
    await saveAllTags([
      { uid: '04:01:01:01:01:01:01', name: 'T1', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] },
      { uid: '04:02:02:02:02:02:02', name: 'T2', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] },
      { uid: '04:03:03:03:03:03:03', name: 'T3', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] }
    ]);

    expect(await countTags()).toBe(3);

    await deleteTags(['04:01:01:01:01:01:01', '04:03:03:03:03:03:03']);
    expect(await countTags()).toBe(1);

    const remaining = await getAllTags();
    expect(remaining[0].uid).toBe('04020202020202');
  });

  it('atomically replaces tag registry via replaceTagRegistry', async () => {
    await saveAllTags([
      { uid: '04:01:01:01:01:01:01', name: 'Old 1', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] },
      { uid: '04:02:02:02:02:02:02', name: 'Old 2', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] }
    ]);

    const nextTags: NFCTagItem[] = [
      { uid: '04:99:99:99:99:99:99', name: 'Brand New', firstSeen: 2000, lastRead: 2000, readCount: 1, hasNdef: false, records: [] }
    ];

    await replaceTagRegistry(nextTags);

    const all = await getAllTags();
    expect(all.length).toBe(1);
    expect(all[0].uid).toBe('04999999999999');
  });

  it('clears all tags from the store', async () => {
    await saveAllTags([
      { uid: '04:01:01:01:01:01:01', name: 'T1', firstSeen: 1, lastRead: 1, readCount: 1, hasNdef: false, records: [] }
    ]);

    await clearAllTags();
    expect(await countTags()).toBe(0);
  });
});
