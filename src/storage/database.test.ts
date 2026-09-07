// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { 
  getNfcDb, 
  closeNfcDb, 
  resetNfcDbForTesting, 
  DB_NAME, 
  DB_VERSION, 
  TAGS_STORE_NAME, 
  PHOTOS_STORE_NAME 
} from './database';

describe('Unified Database (nfcweb_db) Schema & Connection Lifecycle', () => {
  beforeEach(async () => {
    await resetNfcDbForTesting();
  });

  it('initializes nfcweb_db with expected name, version, and object stores', async () => {
    const db = await getNfcDb();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);

    const storeNames = Array.from(db.objectStoreNames);
    expect(storeNames).toContain(TAGS_STORE_NAME);
    expect(storeNames).toContain(PHOTOS_STORE_NAME);
    expect(storeNames.length).toBe(2);
  });

  it('reuses the same open connection singleton on consecutive calls', async () => {
    const db1 = await getNfcDb();
    const db2 = await getNfcDb();
    expect(db1).toBe(db2);
  });

  it('re-opens database cleanly after closeNfcDb', async () => {
    const db1 = await getNfcDb();
    closeNfcDb();
    const db2 = await getNfcDb();
    expect(db2).not.toBeNull();
    expect(db2.objectStoreNames.contains(TAGS_STORE_NAME)).toBe(true);
  });
});
