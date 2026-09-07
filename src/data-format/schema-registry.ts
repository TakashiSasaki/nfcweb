import ndefRecordSchema from './schemas/ndef-record.schema.json';
import nfcTagSchema from './schemas/nfc-tag.schema.json';
import nfcTagRegistrySchema from './schemas/nfc-tag-registry.schema.json';

import nfcTagBundle from './generated/bundles/nfc-tag.bundle.json';
import nfcTagRegistryBundle from './generated/bundles/nfc-tag-registry.bundle.json';

export interface SchemaFamilyDefinition {
  family: string;
  title: string;
  resourceTitle: string;
  canonicalId: string;
  description: string;
  jsonSchemaDraft: string;
  versions: string[];
  subtypeAnchors: string[];
  dependencies: string[];
  hasBundle: boolean;
  schema: Record<string, any>;
  bundle?: Record<string, any>;
}

export const SCHEMA_FAMILIES: Record<string, SchemaFamilyDefinition> = {
  'ndef-record': {
    family: 'ndef-record',
    title: 'NDEF Record',
    resourceTitle: 'NdefRecordV1',
    canonicalId: 'https://nfcweb.ai.studio/schemas/ndef-record/v1',
    description: 'Discriminated union of supported NFC Data Exchange Format (NDEF) records (Text, URL, MIME, Empty).',
    jsonSchemaDraft: 'Draft 2020-12',
    versions: ['v1'],
    subtypeAnchors: ['#text', '#url', '#mime', '#empty'],
    dependencies: [],
    hasBundle: false,
    schema: ndefRecordSchema
  },
  'nfc-tag': {
    family: 'nfc-tag',
    title: 'NFC Tag',
    resourceTitle: 'NfcTagV1',
    canonicalId: 'https://nfcweb.ai.studio/schemas/nfc-tag/v1',
    description: 'Canonical representation of a managed NFC tag entry with metadata and NDEF records.',
    jsonSchemaDraft: 'Draft 2020-12',
    versions: ['v1'],
    subtypeAnchors: [],
    dependencies: ['https://nfcweb.ai.studio/schemas/ndef-record/v1'],
    hasBundle: true,
    schema: nfcTagSchema,
    bundle: nfcTagBundle
  },
  'nfc-tag-registry': {
    family: 'nfc-tag-registry',
    title: 'NFC Tag Registry',
    resourceTitle: 'NfcTagRegistryV1',
    canonicalId: 'https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1',
    description: 'Canonical interchange format for the NFCWeb NFC tag registry backup, transfer, and migration.',
    jsonSchemaDraft: 'Draft 2020-12',
    versions: ['v1'],
    subtypeAnchors: [],
    dependencies: ['https://nfcweb.ai.studio/schemas/nfc-tag/v1'],
    hasBundle: true,
    schema: nfcTagRegistrySchema,
    bundle: nfcTagRegistryBundle
  }
};

export function getAllSchemaFamilies(): SchemaFamilyDefinition[] {
  return Object.values(SCHEMA_FAMILIES);
}

export function getSchemaFamily(family: string): SchemaFamilyDefinition | undefined {
  return SCHEMA_FAMILIES[family];
}

export function getSchemaResource(family: string, version: string): Record<string, any> | undefined {
  const fam = SCHEMA_FAMILIES[family];
  if (!fam || !fam.versions.includes(version)) return undefined;
  return fam.schema;
}

export function getSchemaBundle(family: string, version: string): Record<string, any> | undefined {
  const fam = SCHEMA_FAMILIES[family];
  if (!fam || !fam.versions.includes(version) || !fam.hasBundle) return undefined;
  return fam.bundle;
}

// Re-export raw schemas
export {
  ndefRecordSchema,
  nfcTagSchema,
  nfcTagRegistrySchema,
  nfcTagBundle,
  nfcTagRegistryBundle
};

/**
 * Base styles for schema documentation pages.
 */
const BASE_PAGE_STYLE = `
  :root {
    --bg: #090d16;
    --surface: #0f172a;
    --surface-border: #1e293b;
    --text: #e2e8f0;
    --text-muted: #94a3b8;
    --primary: #38bdf8;
    --primary-bg: rgba(56, 189, 248, 0.1);
    --primary-border: rgba(56, 189, 248, 0.3);
    --accent: #10b981;
    --accent-bg: rgba(16, 185, 129, 0.1);
    --accent-border: rgba(16, 185, 129, 0.3);
    --code-bg: #020617;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: var(--bg);
    color: var(--text);
    line-height: 1.6;
    padding: 2rem 1.5rem;
  }
  .container {
    max-width: 960px;
    margin: 0 auto;
  }
  header {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--surface-border);
  }
  .breadcrumbs {
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
  }
  .breadcrumbs a {
    color: var(--primary);
    text-decoration: none;
  }
  .breadcrumbs a:hover { text-decoration: underline; }
  h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #f8fafc;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .subtitle {
    font-size: 1.125rem;
    color: var(--text-muted);
    margin-top: 0.5rem;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    font-size: 0.75rem;
    font-weight: 600;
    font-family: ui-monospace, monospace;
    padding: 0.25rem 0.6rem;
    border-radius: 9999px;
    background: var(--primary-bg);
    color: var(--primary);
    border: 1px solid var(--primary-border);
  }
  .badge-green {
    background: var(--accent-bg);
    color: var(--accent);
    border-color: var(--accent-border);
  }
  .badge-purple {
    background: rgba(168, 85, 247, 0.1);
    color: #c084fc;
    border-color: rgba(168, 85, 247, 0.3);
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--surface-border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .card h2 {
    font-size: 1.25rem;
    margin-bottom: 1rem;
    color: #f1f5f9;
  }
  .card h3 {
    font-size: 1rem;
    margin: 1rem 0 0.5rem 0;
    color: #cbd5e1;
  }
  p { margin-bottom: 1rem; }
  ul { margin-left: 1.5rem; margin-bottom: 1rem; }
  li { margin-bottom: 0.5rem; }
  a { color: var(--primary); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1rem;
    margin-top: 1rem;
  }
  .endpoint-card {
    background: var(--surface);
    border: 1px solid var(--surface-border);
    border-radius: 0.75rem;
    padding: 1.25rem;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }
  .endpoint-card:hover {
    border-color: var(--primary);
    transform: translateY(-2px);
  }
  .endpoint-card h3 {
    font-size: 1.125rem;
    margin-bottom: 0.5rem;
  }
  code, pre {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }
  code {
    background: var(--code-bg);
    color: #38bdf8;
    padding: 0.2rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    border: 1px solid #1e293b;
  }
  pre {
    background: var(--code-bg);
    padding: 1rem;
    border-radius: 0.5rem;
    border: 1px solid var(--surface-border);
    overflow-x: auto;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1rem 0;
    font-size: 0.9rem;
  }
  th, td {
    padding: 0.65rem 0.85rem;
    text-align: left;
    border-bottom: 1px solid var(--surface-border);
  }
  th {
    background: #1e293b;
    color: #f8fafc;
    font-weight: 600;
  }
  tr:hover { background: rgba(255, 255, 255, 0.02); }
  footer {
    margin-top: 3rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--surface-border);
    font-size: 0.875rem;
    color: var(--text-muted);
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
  }
`;

/**
 * Renders the HTML index page at /schemas.
 */
export function renderSchemaIndexHtml(): string {
  const families = getAllSchemaFamilies();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NFCWeb Schema Directory</title>
  <meta name="description" content="Canonical JSON Schema resources and documentation for NFCWeb data interchange." />
  <style>${BASE_PAGE_STYLE}</style>
</head>
<body>
  <div class="container">
    <header>
      <div class="breadcrumbs">
        <a href="/">← NFCWeb Application</a>
      </div>
      <h1>
        <span>NFCWeb Schema Directory</span>
        <span class="badge">Draft 2020-12</span>
        <span class="badge badge-green">Production</span>
      </h1>
      <p class="subtitle">
        Authoritative modular JSON Schema resources and compound documents for NFC data interchange.
      </p>
    </header>

    <div class="card">
      <h2>Architecture &amp; Dependency Graph</h2>
      <p>
        NFCWeb schemas are modular, independently reusable JSON Schema resources (Draft 2020-12). Lower-level concepts are never duplicated inside higher-level schemas:
      </p>
      <pre><code>NfcTagRegistryV1 (https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1)
    ↓ references
NfcTagV1 (https://nfcweb.ai.studio/schemas/nfc-tag/v1)
    ↓ references
NdefRecordV1 (https://nfcweb.ai.studio/schemas/ndef-record/v1)</code></pre>
      <p>
        Canonical <code>$id</code> URIs are dereferenceable over HTTPS directly from this deployment with standard <code>application/schema+json</code> responses and CORS headers.
      </p>
    </div>

    <h2 style="font-size: 1.5rem; margin-bottom: 1rem; color: #f8fafc;">Available Schema Families</h2>
    <div class="grid">
      ${families.map(fam => `
        <div class="endpoint-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
            <h3 style="margin: 0;"><a href="/schemas/${fam.family}">${fam.title}</a></h3>
            <span class="badge">v1</span>
          </div>
          <p style="font-size: 0.875rem; color: var(--text-muted); margin-bottom: 1rem;">${fam.description}</p>
          <div style="margin-bottom: 0.75rem;">
            <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Canonical Resource:</span>
            <a href="/schemas/${fam.family}/v1" style="font-size: 0.825rem; word-break: break-all;"><code>/schemas/${fam.family}/v1</code></a>
          </div>
          ${fam.hasBundle ? `
          <div style="margin-bottom: 0.75rem;">
            <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">Self-Contained Bundle:</span>
            <a href="/schemas/${fam.family}/v1/bundle" style="font-size: 0.825rem; word-break: break-all;"><code>/schemas/${fam.family}/v1/bundle</code></a>
          </div>
          ` : ''}
          <div style="margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--surface-border);">
            <a href="/schemas/${fam.family}" style="font-size: 0.875rem; font-weight: 600;">View Documentation →</a>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="card" style="margin-top: 2rem;">
      <h2>Versioning &amp; Compatibility Policy</h2>
      <ul>
        <li><strong>Immutable Versions:</strong> <code>/v1</code> paths represent an immutable compatibility generation. Semantic changes require a new version (e.g. <code>/v2</code>).</li>
        <li><strong>Versionless Family Paths:</strong> <code>/schemas/&lt;family&gt;</code> routes serve human-facing documentation only and are never used as canonical <code>$id</code> or <code>$ref</code>.</li>
        <li><strong>Compound Schema Documents:</strong> Standalone bundles are generated artifacts that embed dependencies under <code>$defs</code> while strictly preserving canonical <code>$id</code> and <code>$ref</code> URIs.</li>
      </ul>
    </div>

    <footer>
      <div>NFCWeb · High-Integrity NFC Tag Management</div>
      <div><a href="/">Back to NFCWeb App</a></div>
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Renders the human-facing HTML documentation page for a schema family.
 */
export function renderSchemaFamilyHtml(familyId: string): string | undefined {
  const family = getSchemaFamily(familyId);
  if (!family) return undefined;

  const prettySchema = JSON.stringify(family.schema, null, 2);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${family.title} Schema · NFCWeb</title>
  <meta name="description" content="Canonical schema documentation and JSON Schema resources for ${family.title}." />
  <style>${BASE_PAGE_STYLE}</style>
</head>
<body>
  <div class="container">
    <header>
      <div class="breadcrumbs">
        <a href="/">NFCWeb</a> / <a href="/schemas">Schemas</a> / <span>${family.family}</span>
      </div>
      <h1>
        <span>${family.title} Schema</span>
        <span class="badge">v1</span>
        <span class="badge badge-purple">${family.jsonSchemaDraft}</span>
      </h1>
      <p class="subtitle">${family.description}</p>
    </header>

    <div class="card">
      <h2>Resource Identifiers &amp; Endpoints</h2>
      <table>
        <tbody>
          <tr>
            <th style="width: 200px;">Canonical $id</th>
            <td><code>${family.canonicalId}</code></td>
          </tr>
          <tr>
            <th>JSON Schema Route</th>
            <td>
              <a href="/schemas/${family.family}/v1"><code>GET /schemas/${family.family}/v1</code></a>
              <span class="badge" style="margin-left: 0.5rem;">application/schema+json</span>
            </td>
          </tr>
          ${family.hasBundle ? `
          <tr>
            <th>Compound Bundle</th>
            <td>
              <a href="/schemas/${family.family}/v1/bundle"><code>GET /schemas/${family.family}/v1/bundle</code></a>
              <span class="badge badge-green" style="margin-left: 0.5rem;">Self-Contained</span>
            </td>
          </tr>
          ` : ''}
          <tr>
            <th>Schema Draft</th>
            <td>${family.jsonSchemaDraft}</td>
          </tr>
          <tr>
            <th>Compatibility</th>
            <td>Versioned immutable contract (<code>/v1</code>). Breaking changes will be published under <code>/v2</code>.</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${family.subtypeAnchors.length > 0 ? `
    <div class="card">
      <h2>Public Subtype Anchors</h2>
      <p>
        Stable <code>$anchor</code> identifiers exposed by this canonical schema. Consumers can reference these subtypes directly without implementation-specific JSON Pointers:
      </p>
      <table>
        <thead>
          <tr>
            <th>Anchor</th>
            <th>Canonical Dereferenceable Reference</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${family.subtypeAnchors.map(anchor => {
            const name = anchor.replace('#', '');
            return `
              <tr>
                <td><code>${anchor}</code></td>
                <td><code>${family.canonicalId}${anchor}</code></td>
                <td>NDEF ${name.toUpperCase()} record subtype specification.</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="card">
      <h2>Dependencies</h2>
      ${family.dependencies.length > 0 ? `
        <p>This schema references the following external canonical schema resources:</p>
        <ul>
          ${family.dependencies.map(dep => `
            <li>
              <code>${dep}</code>
              — <a href="${dep.replace('https://nfcweb.ai.studio', '')}">Documentation</a>
            </li>
          `).join('')}
        </ul>
      ` : `
        <p>This is a foundational schema resource with no external schema dependencies.</p>
      `}
    </div>

    <div class="card">
      <h2>Usage Example</h2>
      <h3>Fetch via HTTP</h3>
      <pre><code>curl -i -H "Accept: application/schema+json" \\
  https://nfcweb.ai.studio/schemas/${family.family}/v1</code></pre>

      <h3>Validate with Ajv (Draft 2020-12)</h3>
      <pre><code>import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

// Fetch or import canonical schema
const response = await fetch('/schemas/${family.family}/v1');
const schema = await response.json();
const validate = ajv.compile(schema);</code></pre>
    </div>

    <div class="card">
      <h2>Canonical JSON Schema Definition</h2>
      <pre><code>${prettySchema}</code></pre>
    </div>

    <footer>
      <div><a href="/schemas">← All Schemas</a></div>
      <div><a href="/">Back to NFCWeb App</a></div>
    </footer>
  </div>
</body>
</html>`;
}
