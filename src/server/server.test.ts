import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server';

const app = createApp();

describe('HTTP Schema Publication & Routing', () => {
  it('GET /schemas returns the human-facing HTML directory', async () => {
    const res = await request(app).get('/schemas');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('NFCWeb Schema Directory');
    expect(res.text).toContain('/schemas/ndef-record');
    expect(res.text).toContain('/schemas/nfc-tag');
    expect(res.text).toContain('/schemas/nfc-tag-registry');
  });

  it('GET /schemas/ndef-record returns documentation for NDEF record schema', async () => {
    const res = await request(app).get('/schemas/ndef-record');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('NDEF Record Schema');
    expect(res.text).toContain('https://nfcweb.ai.studio/schemas/ndef-record/v1');
    expect(res.text).toContain('#text');
    expect(res.text).toContain('#url');
    expect(res.text).toContain('#mime');
    expect(res.text).toContain('#empty');
  });

  it('GET /schemas/ndef-record/v1 returns canonical NdefRecordV1 JSON schema with CORS and immutable caching', async () => {
    const res = await request(app).get('/schemas/ndef-record/v1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/schema+json');
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/ndef-record/v1');
    expect(res.body.title).toBe('NdefRecordV1');
  });

  it('GET /schemas/ndef-record/v1/bundle returns 404 since ndef-record has no external dependencies', async () => {
    const res = await request(app).get('/schemas/ndef-record/v1/bundle');
    expect(res.status).toBe(404);
    // Crucial requirement: Must never return 200 or fall through to SPA shell
    expect(res.text).not.toContain('<div id="root"></div>');
  });

  it('GET /schemas/nfc-tag returns documentation for NFC tag schema', async () => {
    const res = await request(app).get('/schemas/nfc-tag');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('NFC Tag Schema');
    expect(res.text).toContain('https://nfcweb.ai.studio/schemas/nfc-tag/v1');
    expect(res.text).toContain('/schemas/nfc-tag/v1/bundle');
  });

  it('GET /schemas/nfc-tag/v1 returns canonical NfcTagV1 JSON schema', async () => {
    const res = await request(app).get('/schemas/nfc-tag/v1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/schema+json');
    expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag/v1');
    expect(res.body.title).toBe('NfcTagV1');
    expect(res.body.properties.records.items.$ref).toBe('https://nfcweb.ai.studio/schemas/ndef-record/v1');
  });

  it('GET /schemas/nfc-tag/v1/bundle returns Compound Schema Document for NfcTagV1', async () => {
    const res = await request(app).get('/schemas/nfc-tag/v1/bundle');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/schema+json');
    expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag/v1');
    expect(res.body.$defs['ndef-record'].$id).toBe('https://nfcweb.ai.studio/schemas/ndef-record/v1');
  });

  it('GET /schemas/nfc-tag-registry returns documentation for NFC tag registry schema', async () => {
    const res = await request(app).get('/schemas/nfc-tag-registry');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('NFC Tag Registry Schema');
    expect(res.text).toContain('https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1');
  });

  it('GET /schemas/nfc-tag-registry/v1 returns canonical NfcTagRegistryV1 JSON schema', async () => {
    const res = await request(app).get('/schemas/nfc-tag-registry/v1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/schema+json');
    expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1');
    expect(res.body.title).toBe('NfcTagRegistryV1');
  });

  it('GET /schemas/nfc-tag-registry/v1/bundle returns Compound Schema Document for NfcTagRegistryV1', async () => {
    const res = await request(app).get('/schemas/nfc-tag-registry/v1/bundle');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/schema+json');
    expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1');
    expect(res.body.$defs['nfc-tag'].$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag/v1');
    expect(res.body.$defs['ndef-record'].$id).toBe('https://nfcweb.ai.studio/schemas/ndef-record/v1');
  });

  it('OPTIONS /schemas/ndef-record/v1 responds with CORS headers', async () => {
    const res = await request(app).options('/schemas/ndef-record/v1');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('unknown schema routes return 404 and NEVER fall through to SPA shell', async () => {
    const badRoutes = [
      '/schemas/unknown-schema',
      '/schemas/ndef-record/v2',
      '/schemas/nfc-tag/v999',
      '/schemas/nfc-tag-registry/v0',
      '/schemas/foo/bar/baz'
    ];

    for (const route of badRoutes) {
      const res = await request(app).get(route);
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('<div id="root"></div>');
      expect(res.text).toContain('404');
    }
  });

  it('unknown schema routes return JSON error when Accept header prefers json', async () => {
    const res = await request(app)
      .get('/schemas/nonexistent')
      .set('Accept', 'application/json');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not Found');
  });
});
