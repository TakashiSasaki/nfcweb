import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

export interface DeploymentCheckOptions {
  baseUrl?: string;
  quiet?: boolean;
  timeoutMs?: number;
}

export interface CheckFailure {
  name: string;
  url: string;
  expected: string;
  actual: string;
}

export interface CheckSummary {
  passed: string[];
  failed: CheckFailure[];
}

const DEFAULT_BASE_URL = 'https://nfcweb.ai.studio';
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Normalizes user-supplied base URL by stripping trailing slashes.
 */
export function normalizeBaseUrl(rawUrl?: string): string {
  if (!rawUrl || rawUrl.trim() === '') {
    return DEFAULT_BASE_URL;
  }
  return rawUrl.trim().replace(/\/+$/, '');
}

/**
 * Performs an HTTP request with a timeout.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs the full suite of deployment acceptance checks against the target base URL.
 */
export async function runDeploymentChecks(
  options: DeploymentCheckOptions = {}
): Promise<CheckSummary> {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const quiet = options.quiet ?? false;

  const passed: string[] = [];
  const failed: CheckFailure[] = [];

  const logPass = (name: string) => {
    passed.push(name);
    if (!quiet) {
      console.log(`PASS ${name}`);
    }
  };

  const recordFail = (name: string, url: string, expected: string, actual: string) => {
    failed.push({ name, url, expected, actual });
    if (!quiet) {
      console.error(`\nFAIL ${name}`);
      console.error(`Requested URL: ${url}`);
      console.error(`Expected:      ${expected}`);
      console.error(`Actual:        ${actual}\n`);
    }
  };

  // --------------------------------------------------------------------------
  // Check 1: GET /schemas (Schema directory HTML)
  // --------------------------------------------------------------------------
  const schemasUrl = `${baseUrl}/schemas`;
  try {
    const res = await fetchWithTimeout(schemasUrl, { headers: { Accept: 'text/html' } }, timeoutMs);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (res.status !== 200) {
      recordFail('/schemas', schemasUrl, 'HTTP status 200', `HTTP status ${res.status}`);
    } else if (!contentType.includes('text/html')) {
      recordFail('/schemas', schemasUrl, 'Content-Type containing text/html', contentType);
    } else if (
      !text.includes('ndef-record') ||
      !text.includes('nfc-tag') ||
      !text.includes('nfc-tag-registry')
    ) {
      recordFail(
        '/schemas',
        schemasUrl,
        'HTML containing references to ndef-record, nfc-tag, and nfc-tag-registry schema families',
        'HTML missing one or more schema family references'
      );
    } else {
      logPass('/schemas');
    }
  } catch (err: any) {
    recordFail('/schemas', schemasUrl, 'Successful HTTP response', err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Check 2: GET /schemas/ndef-record (NDEF human-facing documentation HTML)
  // --------------------------------------------------------------------------
  const ndefDocsUrl = `${baseUrl}/schemas/ndef-record`;
  try {
    const res = await fetchWithTimeout(ndefDocsUrl, { headers: { Accept: 'text/html' } }, timeoutMs);
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (res.status !== 200) {
      recordFail('/schemas/ndef-record', ndefDocsUrl, 'HTTP status 200', `HTTP status ${res.status}`);
    } else if (!contentType.includes('text/html')) {
      recordFail('/schemas/ndef-record', ndefDocsUrl, 'Content-Type containing text/html', contentType);
    } else if (!text.includes('https://nfcweb.ai.studio/schemas/ndef-record/v1')) {
      recordFail(
        '/schemas/ndef-record',
        ndefDocsUrl,
        'Documentation mentioning canonical URI https://nfcweb.ai.studio/schemas/ndef-record/v1',
        'Canonical URI not found in documentation HTML'
      );
    } else {
      logPass('/schemas/ndef-record');
    }
  } catch (err: any) {
    recordFail('/schemas/ndef-record', ndefDocsUrl, 'Successful HTTP response', err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Check 3: GET /schemas/ndef-record/v1 (Canonical NDEF JSON Schema)
  // --------------------------------------------------------------------------
  const ndefSchemaUrl = `${baseUrl}/schemas/ndef-record/v1`;
  try {
    const res = await fetchWithTimeout(
      ndefSchemaUrl,
      { headers: { Accept: 'application/schema+json' } },
      timeoutMs
    );
    const contentType = res.headers.get('content-type') || '';
    const cors = res.headers.get('access-control-allow-origin') || '';
    const cacheControl = res.headers.get('cache-control') || '';

    if (res.status !== 200) {
      recordFail('/schemas/ndef-record/v1', ndefSchemaUrl, 'HTTP status 200', `HTTP status ${res.status}`);
    } else if (!contentType.includes('application/schema+json')) {
      recordFail('/schemas/ndef-record/v1', ndefSchemaUrl, 'Content-Type containing application/schema+json', contentType);
    } else if (cors !== '*') {
      recordFail('/schemas/ndef-record/v1', ndefSchemaUrl, 'Access-Control-Allow-Origin: *', cors || '(missing)');
    } else if (!cacheControl.includes('immutable')) {
      recordFail('/schemas/ndef-record/v1', ndefSchemaUrl, 'Cache-Control containing immutable', cacheControl || '(missing)');
    } else {
      const json = await res.json();
      const expectedId = 'https://nfcweb.ai.studio/schemas/ndef-record/v1';
      const expectedTitle = 'NdefRecordV1';

      if (json.$id !== expectedId) {
        recordFail('/schemas/ndef-record/v1', ndefSchemaUrl, `$id === "${expectedId}"`, String(json.$id));
      } else if (json.title !== expectedTitle) {
        recordFail('/schemas/ndef-record/v1', ndefSchemaUrl, `title === "${expectedTitle}"`, String(json.title));
      } else {
        // Verify public subtype anchors: text, url, mime, empty
        const defAnchors = Object.values(json.$defs || {})
          .map((d: any) => d.$anchor)
          .filter(Boolean);
        const oneOfRefs = (json.oneOf || []).map((o: any) => o.$ref).filter(Boolean);
        const requiredAnchors = ['text', 'url', 'mime', 'empty'];
        const missingAnchors = requiredAnchors.filter(
          (a) => !defAnchors.includes(a) && !oneOfRefs.includes(`#${a}`)
        );

        if (missingAnchors.length > 0) {
          recordFail(
            '/schemas/ndef-record/v1',
            ndefSchemaUrl,
            'Subtype anchors text, url, mime, empty present in schema',
            `Missing anchors: ${missingAnchors.join(', ')}`
          );
        } else {
          logPass('/schemas/ndef-record/v1');
        }
      }
    }
  } catch (err: any) {
    recordFail('/schemas/ndef-record/v1', ndefSchemaUrl, 'Valid canonical schema response', err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Check 4: GET /schemas/nfc-tag/v1 (Canonical NFC Tag JSON Schema)
  // --------------------------------------------------------------------------
  const tagSchemaUrl = `${baseUrl}/schemas/nfc-tag/v1`;
  try {
    const res = await fetchWithTimeout(
      tagSchemaUrl,
      { headers: { Accept: 'application/schema+json' } },
      timeoutMs
    );
    const contentType = res.headers.get('content-type') || '';

    if (res.status !== 200) {
      recordFail('/schemas/nfc-tag/v1', tagSchemaUrl, 'HTTP status 200', `HTTP status ${res.status}`);
    } else if (!contentType.includes('application/schema+json')) {
      recordFail('/schemas/nfc-tag/v1', tagSchemaUrl, 'Content-Type containing application/schema+json', contentType);
    } else {
      const json = await res.json();
      const expectedId = 'https://nfcweb.ai.studio/schemas/nfc-tag/v1';
      const expectedRef = 'https://nfcweb.ai.studio/schemas/ndef-record/v1';
      const actualRef = json?.properties?.records?.items?.$ref;

      if (json.$id !== expectedId) {
        recordFail('/schemas/nfc-tag/v1', tagSchemaUrl, `$id === "${expectedId}"`, String(json.$id));
      } else if (actualRef !== expectedRef) {
        recordFail(
          '/schemas/nfc-tag/v1',
          tagSchemaUrl,
          `properties.records.items.$ref === "${expectedRef}"`,
          String(actualRef)
        );
      } else {
        logPass('/schemas/nfc-tag/v1');
      }
    }
  } catch (err: any) {
    recordFail('/schemas/nfc-tag/v1', tagSchemaUrl, 'Valid canonical schema response', err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Check 5: GET /schemas/nfc-tag-registry/v1 (Canonical NFC Tag Registry Schema)
  // --------------------------------------------------------------------------
  const registrySchemaUrl = `${baseUrl}/schemas/nfc-tag-registry/v1`;
  try {
    const res = await fetchWithTimeout(
      registrySchemaUrl,
      { headers: { Accept: 'application/schema+json' } },
      timeoutMs
    );
    const contentType = res.headers.get('content-type') || '';

    if (res.status !== 200) {
      recordFail('/schemas/nfc-tag-registry/v1', registrySchemaUrl, 'HTTP status 200', `HTTP status ${res.status}`);
    } else if (!contentType.includes('application/schema+json')) {
      recordFail('/schemas/nfc-tag-registry/v1', registrySchemaUrl, 'Content-Type containing application/schema+json', contentType);
    } else {
      const json = await res.json();
      const expectedId = 'https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1';
      const expectedRef = 'https://nfcweb.ai.studio/schemas/nfc-tag/v1';
      const actualRef = json?.properties?.tags?.items?.$ref;

      if (json.$id !== expectedId) {
        recordFail('/schemas/nfc-tag-registry/v1', registrySchemaUrl, `$id === "${expectedId}"`, String(json.$id));
      } else if (actualRef !== expectedRef) {
        recordFail(
          '/schemas/nfc-tag-registry/v1',
          registrySchemaUrl,
          `properties.tags.items.$ref === "${expectedRef}"`,
          String(actualRef)
        );
      } else {
        logPass('/schemas/nfc-tag-registry/v1');
      }
    }
  } catch (err: any) {
    recordFail('/schemas/nfc-tag-registry/v1', registrySchemaUrl, 'Valid canonical schema response', err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Check 6A: GET /schemas/nfc-tag/v1/bundle (NfcTag Compound Bundle)
  // --------------------------------------------------------------------------
  const tagBundleUrl = `${baseUrl}/schemas/nfc-tag/v1/bundle`;
  try {
    const res = await fetchWithTimeout(
      tagBundleUrl,
      { headers: { Accept: 'application/schema+json' } },
      timeoutMs
    );
    const contentType = res.headers.get('content-type') || '';

    if (res.status !== 200) {
      recordFail('/schemas/nfc-tag/v1/bundle', tagBundleUrl, 'HTTP status 200', `HTTP status ${res.status}`);
    } else if (!contentType.includes('application/schema+json')) {
      recordFail('/schemas/nfc-tag/v1/bundle', tagBundleUrl, 'Content-Type containing application/schema+json', contentType);
    } else {
      const json = await res.json();
      const expectedId = 'https://nfcweb.ai.studio/schemas/nfc-tag/v1';
      const embeddedNdefId = json?.$defs?.['ndef-record']?.$id;

      if (json.$id !== expectedId) {
        recordFail('/schemas/nfc-tag/v1/bundle', tagBundleUrl, `$id === "${expectedId}"`, String(json.$id));
      } else if (embeddedNdefId !== 'https://nfcweb.ai.studio/schemas/ndef-record/v1') {
        recordFail(
          '/schemas/nfc-tag/v1/bundle',
          tagBundleUrl,
          `$defs['ndef-record'].$id === "https://nfcweb.ai.studio/schemas/ndef-record/v1"`,
          String(embeddedNdefId)
        );
      } else {
        // AJV standalone validation with downloaded bundle (zero external network fetch)
        try {
          const ajv = new Ajv2020({ allErrors: true, strict: false });
          addFormats(ajv);
          const validate = ajv.compile(json);

          const validTag = {
            uid: '045ab23c9d8001',
            firstSeen: 1000,
            lastRead: 2000,
            readCount: 1,
            hasNdef: true,
            records: [{ id: '1', recordType: 'text', data: 'smoke check' }]
          };
          const invalidTag = {
            uid: '045ab23c9d8001',
            firstSeen: 1000,
            lastRead: 2000,
            readCount: 1,
            hasNdef: true,
            records: [{ id: '1', recordType: 'unsupported-record-type' }]
          };

          if (!validate(validTag)) {
            recordFail(
              '/schemas/nfc-tag/v1/bundle',
              tagBundleUrl,
              'Downloaded bundle successfully validates a conforming tag payload',
              JSON.stringify(validate.errors)
            );
          } else if (validate(invalidTag)) {
            recordFail(
              '/schemas/nfc-tag/v1/bundle',
              tagBundleUrl,
              'Downloaded bundle rejects an invalid recordType payload',
              'Accepted invalid tag'
            );
          } else {
            logPass('/schemas/nfc-tag/v1/bundle');
          }
        } catch (ajvErr: any) {
          recordFail(
            '/schemas/nfc-tag/v1/bundle',
            tagBundleUrl,
            'Compilable with fresh Ajv2020 instance without network access',
            ajvErr?.message || String(ajvErr)
          );
        }
      }
    }
  } catch (err: any) {
    recordFail('/schemas/nfc-tag/v1/bundle', tagBundleUrl, 'Valid compound schema bundle response', err?.message || String(err));
  }

  // --------------------------------------------------------------------------
  // Check 6B: GET /schemas/nfc-tag-registry/v1/bundle (Registry Compound Bundle)
  // --------------------------------------------------------------------------
  const registryBundleUrl = `${baseUrl}/schemas/nfc-tag-registry/v1/bundle`;
  try {
    const res = await fetchWithTimeout(
      registryBundleUrl,
      { headers: { Accept: 'application/schema+json' } },
      timeoutMs
    );
    const contentType = res.headers.get('content-type') || '';

    if (res.status !== 200) {
      recordFail(
        '/schemas/nfc-tag-registry/v1/bundle',
        registryBundleUrl,
        'HTTP status 200',
        `HTTP status ${res.status}`
      );
    } else if (!contentType.includes('application/schema+json')) {
      recordFail(
        '/schemas/nfc-tag-registry/v1/bundle',
        registryBundleUrl,
        'Content-Type containing application/schema+json',
        contentType
      );
    } else {
      const json = await res.json();
      const expectedId = 'https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1';
      const embeddedTagId = json?.$defs?.['nfc-tag']?.$id;
      const embeddedNdefId = json?.$defs?.['ndef-record']?.$id;

      if (json.$id !== expectedId) {
        recordFail('/schemas/nfc-tag-registry/v1/bundle', registryBundleUrl, `$id === "${expectedId}"`, String(json.$id));
      } else if (embeddedTagId !== 'https://nfcweb.ai.studio/schemas/nfc-tag/v1') {
        recordFail(
          '/schemas/nfc-tag-registry/v1/bundle',
          registryBundleUrl,
          `$defs['nfc-tag'].$id === "https://nfcweb.ai.studio/schemas/nfc-tag/v1"`,
          String(embeddedTagId)
        );
      } else if (embeddedNdefId !== 'https://nfcweb.ai.studio/schemas/ndef-record/v1') {
        recordFail(
          '/schemas/nfc-tag-registry/v1/bundle',
          registryBundleUrl,
          `$defs['ndef-record'].$id === "https://nfcweb.ai.studio/schemas/ndef-record/v1"`,
          String(embeddedNdefId)
        );
      } else {
        // AJV standalone validation with downloaded registry bundle
        try {
          const ajv = new Ajv2020({ allErrors: true, strict: false });
          addFormats(ajv);
          const validate = ajv.compile(json);

          const validRegistry = {
            format: 'nfcweb-tag-registry',
            schemaVersion: 1,
            exportedAt: '2026-09-07T00:00:00.000Z',
            appVersion: '1.0.0',
            tags: [
              {
                uid: '045ab23c9d8001',
                firstSeen: 1000,
                lastRead: 2000,
                readCount: 1,
                hasNdef: true,
                records: [{ id: '1', recordType: 'text', data: 'smoke check' }]
              }
            ]
          };
          const invalidRegistry = {
            format: 'nfcweb-tag-registry',
            schemaVersion: 1,
            exportedAt: '2026-09-07T00:00:00.000Z',
            appVersion: '1.0.0',
            tags: [
              {
                uid: '045ab23c9d8001',
                firstSeen: 1000,
                lastRead: 2000,
                readCount: 1,
                hasNdef: true,
                records: [{ id: '1', recordType: 'invalid-type' }]
              }
            ]
          };

          if (!validate(validRegistry)) {
            recordFail(
              '/schemas/nfc-tag-registry/v1/bundle',
              registryBundleUrl,
              'Downloaded registry bundle validates conforming tag registry export',
              JSON.stringify(validate.errors)
            );
          } else if (validate(invalidRegistry)) {
            recordFail(
              '/schemas/nfc-tag-registry/v1/bundle',
              registryBundleUrl,
              'Downloaded registry bundle rejects corrupted NDEF records',
              'Accepted corrupted registry payload'
            );
          } else {
            logPass('/schemas/nfc-tag-registry/v1/bundle');
          }
        } catch (ajvErr: any) {
          recordFail(
            '/schemas/nfc-tag-registry/v1/bundle',
            registryBundleUrl,
            'Compilable with fresh Ajv2020 instance without network access',
            ajvErr?.message || String(ajvErr)
          );
        }
      }
    }
  } catch (err: any) {
    recordFail(
      '/schemas/nfc-tag-registry/v1/bundle',
      registryBundleUrl,
      'Valid compound schema bundle response',
      err?.message || String(err)
    );
  }

  // --------------------------------------------------------------------------
  // Check 7: Schema-specific 404 checks (Never fall through to SPA)
  // --------------------------------------------------------------------------
  const invalidSchemaPaths = [
    '/schemas/ndef-record/v999',
    '/schemas/unknown-family',
    '/schemas/ndef-record/v1/bundle'
  ];

  let schema404Ok = true;
  for (const subpath of invalidSchemaPaths) {
    const invalidUrl = `${baseUrl}${subpath}`;
    try {
      const res = await fetchWithTimeout(invalidUrl, {}, timeoutMs);
      const text = await res.text();

      if (res.status !== 404) {
        schema404Ok = false;
        recordFail('schema 404 isolation', invalidUrl, 'HTTP status 404', `HTTP status ${res.status}`);
        break;
      }
      // Must not return the SPA shell
      if (text.includes('<div id="root">') || text.includes('NFCWeb App Shell')) {
        schema404Ok = false;
        recordFail(
          'schema 404 isolation',
          invalidUrl,
          'Dedicated 404 response without SPA index.html',
          'Returned SPA HTML shell'
        );
        break;
      }
    } catch (err: any) {
      schema404Ok = false;
      recordFail('schema 404 isolation', invalidUrl, 'HTTP status 404', err?.message || String(err));
      break;
    }
  }
  if (schema404Ok) {
    logPass('schema 404 isolation');
  }

  // --------------------------------------------------------------------------
  // Check 8: Normal application routing & SPA fallback
  // --------------------------------------------------------------------------
  let appRoutingOk = true;
  const spaRoutes = ['/', '/debug'];
  for (const route of spaRoutes) {
    const routeUrl = `${baseUrl}${route}`;
    try {
      const res = await fetchWithTimeout(routeUrl, { headers: { Accept: 'text/html' } }, timeoutMs);
      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();

      if (res.status !== 200) {
        appRoutingOk = false;
        recordFail('normal application routing', routeUrl, 'HTTP status 200', `HTTP status ${res.status}`);
        break;
      }
      if (!contentType.includes('text/html')) {
        appRoutingOk = false;
        recordFail('normal application routing', routeUrl, 'Content-Type containing text/html', contentType);
        break;
      }
      if (!text.includes('<div id="root">') && !text.includes('id="root"')) {
        appRoutingOk = false;
        recordFail(
          'normal application routing',
          routeUrl,
          'HTML containing SPA container <div id="root">',
          'Missing #root element'
        );
        break;
      }
    } catch (err: any) {
      appRoutingOk = false;
      recordFail('normal application routing', routeUrl, 'HTTP status 200', err?.message || String(err));
      break;
    }
  }
  if (appRoutingOk) {
    logPass('normal application routing');
  }

  // --------------------------------------------------------------------------
  // Check 9: Server artifact isolation
  // --------------------------------------------------------------------------
  const serverArtifactPaths = [
    '/server.cjs',
    '/server.cjs.map',
    '/server/server.cjs',
    '/server/server.cjs.map',
    '/dist/server/server.cjs'
  ];

  let serverIsolationOk = true;
  for (const artifactPath of serverArtifactPaths) {
    const artifactUrl = `${baseUrl}${artifactPath}`;
    try {
      const res = await fetchWithTimeout(artifactUrl, {}, timeoutMs);
      const text = await res.text();

      // In no case may the response expose server implementation code or sourcemaps
      const forbiddenTokens = ['createProductionApp', 'startProductionServer', 'express()', '"mappings":'];
      const leakedToken = forbiddenTokens.find((token) => text.includes(token));

      if (leakedToken) {
        serverIsolationOk = false;
        recordFail(
          'server artifact isolation',
          artifactUrl,
          `No leak of server code or sourcemap`,
          `Response leaked server token "${leakedToken}"`
        );
        break;
      }
    } catch (err: any) {
      serverIsolationOk = false;
      recordFail('server artifact isolation', artifactUrl, 'Safe response without server leaks', err?.message || String(err));
      break;
    }
  }
  if (serverIsolationOk) {
    logPass('server artifact isolation');
  }

  return { passed, failed };
}

/**
 * CLI entry point
 */
async function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
NFCWeb Deployment Smoke Checker

Usage:
  bun run check:deployment -- <baseUrl>
  bun run check:deployment https://nfcweb.ai.studio

Options:
  --help, -h    Show this help message

Environment Variables:
  DEPLOYMENT_URL  Target base URL (default: https://nfcweb.ai.studio)
`);
    process.exit(0);
  }

  const targetUrl =
    args.find((arg) => arg.startsWith('http://') || arg.startsWith('https://')) ||
    args.find((arg) => !arg.startsWith('-')) ||
    process.env.DEPLOYMENT_URL ||
    DEFAULT_BASE_URL;

  console.log(`\n======================================================`);
  console.log(`NFCWeb Deployment Smoke Checker`);
  console.log(`Target Base URL: ${normalizeBaseUrl(targetUrl)}`);
  console.log(`======================================================\n`);

  const { passed, failed } = await runDeploymentChecks({ baseUrl: targetUrl });

  console.log(`\n------------------------------------------------------`);
  console.log(`Summary: ${passed.length} passed, ${failed.length} failed`);
  console.log(`------------------------------------------------------\n`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

// Execute CLI when invoked directly
const isMain = process.argv[1] && (
  process.argv[1].endsWith('check-deployment.ts') ||
  process.argv[1].endsWith('check-deployment.js')
);

if (isMain) {
  main().catch((err) => {
    console.error('Fatal execution error:', err);
    process.exit(1);
  });
}
