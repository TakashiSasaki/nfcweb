import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { Server } from 'node:http';
import { createProductionApp } from './app';
import { runDeploymentChecks, normalizeBaseUrl } from '../../scripts/check-deployment';

describe('Deployment Acceptance Smoke Checker (CI-safe local integration)', () => {
  let tempClientDir: string;
  let server: Server;
  let localBaseUrl: string;

  const FAKE_SPA_HTML = '<!doctype html><html><head><title>NFC Web App</title></head><body><div id="root">NFCWeb App Shell</div></body></html>';

  beforeAll(async () => {
    tempClientDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nfcweb-checker-test-'));
    fs.writeFileSync(path.join(tempClientDir, 'index.html'), FAKE_SPA_HTML, 'utf8');

    const app = createProductionApp({ clientDistPath: tempClientDir });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          localBaseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    try {
      fs.rmSync(tempClientDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('normalizes base URLs correctly', () => {
    expect(normalizeBaseUrl('https://nfcweb.ai.studio/')).toBe('https://nfcweb.ai.studio');
    expect(normalizeBaseUrl('https://nfcweb.ai.studio///')).toBe('https://nfcweb.ai.studio');
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('')).toBe('https://nfcweb.ai.studio');
    expect(normalizeBaseUrl(undefined)).toBe('https://nfcweb.ai.studio');
  });

  it('passes all deployment acceptance checks against a live production application stack', async () => {
    const report = await runDeploymentChecks({
      baseUrl: localBaseUrl,
      quiet: true,
      timeoutMs: 5000
    });

    expect(report.failed).toEqual([]);
    expect(report.passed).toContain('/schemas');
    expect(report.passed).toContain('/schemas/ndef-record');
    expect(report.passed).toContain('/schemas/ndef-record/v1');
    expect(report.passed).toContain('/schemas/nfc-tag/v1');
    expect(report.passed).toContain('/schemas/nfc-tag-registry/v1');
    expect(report.passed).toContain('/schemas/nfc-tag/v1/bundle');
    expect(report.passed).toContain('/schemas/nfc-tag-registry/v1/bundle');
    expect(report.passed).toContain('schema 404 isolation');
    expect(report.passed).toContain('normal application routing');
    expect(report.passed).toContain('server artifact isolation');
    expect(report.passed.length).toBe(10);
  });

  it('fails cleanly and reports diagnostic error details when target URL is invalid or unreachable', async () => {
    // Port 1 is reserved and guaranteed not in use
    const unreachableUrl = 'http://127.0.0.1:1';
    const report = await runDeploymentChecks({
      baseUrl: unreachableUrl,
      quiet: true,
      timeoutMs: 1000
    });

    expect(report.failed.length).toBeGreaterThan(0);
    for (const failure of report.failed) {
      expect(failure.url).toContain('127.0.0.1:1');
      expect(failure.expected).toBeDefined();
      expect(failure.actual).toBeDefined();
    }
  });
});
