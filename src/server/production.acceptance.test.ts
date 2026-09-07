import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createProductionApp } from './app';

describe('Production Serving Acceptance Tests', () => {
  let tempClientDir: string;
  let app: ReturnType<typeof createProductionApp>;

  const FAKE_SPA_HTML = '<!doctype html><html><head><title>NFC Web App</title></head><body><div id="root">NFCWeb App Shell</div></body></html>';
  const FAKE_STATIC_ASSET = '/* nfcweb client asset */ console.log("nfcweb-bundle");';

  beforeAll(() => {
    // Create an isolated fixture client directory to represent dist/client browser assets
    tempClientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfcweb-prod-test-'));

    // Create index.html (SPA entry point)
    fs.writeFileSync(path.join(tempClientDir, 'index.html'), FAKE_SPA_HTML, 'utf8');

    // Create a representative browser static asset under assets/
    const assetsDir = path.join(tempClientDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'app-bundle.js'), FAKE_STATIC_ASSET, 'utf8');

    // Create a web manifest asset
    fs.writeFileSync(
      path.join(tempClientDir, 'manifest.webmanifest'),
      JSON.stringify({ name: 'NFC Web App' }),
      'utf8'
    );

    // Instantiate production app without binding any network port
    app = createProductionApp({ clientDistPath: tempClientDir });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempClientDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('1. Schema route precedence over static serving and SPA fallback', () => {
    it('GET /schemas/ndef-record/v1 returns canonical NdefRecordV1 JSON schema with CORS and immutable caching', async () => {
      const res = await request(app).get('/schemas/ndef-record/v1');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/schema+json');
      expect(res.headers['access-control-allow-origin']).toBe('*');
      expect(res.headers['cache-control']).toContain('immutable');
      expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/ndef-record/v1');
      expect(res.body.title).toBe('NdefRecordV1');
      // Ensure SPA fallback did NOT intercept this route
      expect(res.text).not.toContain('NFCWeb App Shell');
    });

    it('GET /schemas/nfc-tag/v1 returns canonical NfcTagV1 JSON schema', async () => {
      const res = await request(app).get('/schemas/nfc-tag/v1');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/schema+json');
      expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag/v1');
      expect(res.body.title).toBe('NfcTagV1');
      expect(res.text).not.toContain('NFCWeb App Shell');
    });

    it('GET /schemas/nfc-tag-registry/v1 returns canonical NfcTagRegistryV1 JSON schema', async () => {
      const res = await request(app).get('/schemas/nfc-tag-registry/v1');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/schema+json');
      expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1');
      expect(res.body.title).toBe('NfcTagRegistryV1');
      expect(res.text).not.toContain('NFCWeb App Shell');
    });

    it('GET /schemas/nfc-tag/v1/bundle returns Compound Schema Document Bundle', async () => {
      const res = await request(app).get('/schemas/nfc-tag/v1/bundle');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/schema+json');
      expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag/v1');
      expect(res.body.$defs['ndef-record'].$id).toBe('https://nfcweb.ai.studio/schemas/ndef-record/v1');
    });

    it('GET /schemas/nfc-tag-registry/v1/bundle returns Compound Schema Document Bundle', async () => {
      const res = await request(app).get('/schemas/nfc-tag-registry/v1/bundle');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/schema+json');
      expect(res.body.$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1');
      expect(res.body.$defs['nfc-tag'].$id).toBe('https://nfcweb.ai.studio/schemas/nfc-tag/v1');
    });
  });

  describe('2. Human documentation routing in production stack', () => {
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
    });

    it('GET /schemas/nfc-tag returns documentation for NFC tag schema', async () => {
      const res = await request(app).get('/schemas/nfc-tag');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('NFC Tag Schema');
    });

    it('GET /schemas/nfc-tag-registry returns documentation for NFC tag registry schema', async () => {
      const res = await request(app).get('/schemas/nfc-tag-registry');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('NFC Tag Registry Schema');
    });
  });

  describe('3. Unknown schema resource error handling in production stack', () => {
    it('GET /schemas/ndef-record/v999 returns 404 and NEVER returns the SPA index.html', async () => {
      const res = await request(app).get('/schemas/ndef-record/v999');
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('NFCWeb App Shell');
      expect(res.text).toContain('404');
    });

    it('GET /schemas/unknown-family returns 404 and does not return SPA index.html', async () => {
      const res = await request(app).get('/schemas/unknown-family');
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('NFCWeb App Shell');
    });

    it('GET /schemas/ndef-record/v1/bundle returns 404 (no bundle for self-contained schema)', async () => {
      const res = await request(app).get('/schemas/ndef-record/v1/bundle');
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('NFCWeb App Shell');
    });
  });

  describe('4. Production static asset serving', () => {
    it('serves browser-public static asset correctly with 200', async () => {
      const res = await request(app).get('/assets/app-bundle.js');
      expect(res.status).toBe(200);
      expect(res.text).toBe(FAKE_STATIC_ASSET);
    });

    it('serves browser-public web manifest asset with 200', async () => {
      const res = await request(app).get('/manifest.webmanifest');
      expect(res.status).toBe(200);
      expect(JSON.parse(res.text).name).toBe('NFC Web App');
    });
  });

  describe('5. SPA fallback routing for client navigation routes', () => {
    it('GET / returns the SPA index.html', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('NFCWeb App Shell');
    });

    it('GET /some-normal-app-route falls back to SPA index.html', async () => {
      const res = await request(app).get('/some-normal-app-route');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('NFCWeb App Shell');
    });

    it('GET /tags/04a1b2c3d4e5f6 falls back to SPA index.html', async () => {
      const res = await request(app).get('/tags/04a1b2c3d4e5f6');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('NFCWeb App Shell');
    });
  });

  describe('6. Server artifact isolation', () => {
    it('requests to server bundle paths never leak server code or sourcemaps', async () => {
      const forbiddenPaths = [
        '/server.cjs',
        '/server.cjs.map',
        '/server/server.cjs',
        '/server/server.cjs.map',
        '/dist/server/server.cjs'
      ];

      for (const reqPath of forbiddenPaths) {
        const res = await request(app).get(reqPath);
        // Either caught by SPA fallback returning index.html or 404
        // In NO case may it expose server source code or sourcemap
        expect(res.text).not.toContain('createProductionApp');
        expect(res.text).not.toContain('startProductionServer');
        expect(res.text).not.toContain('express()');
        expect(res.text).not.toContain('"mappings":');
      }
    });
  });
});
