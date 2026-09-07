# NFCWeb

Web application for reading, writing, and managing NFC tags (NDEF) with canonical JSON Schema publication and offline PWA capabilities.

## Architecture & Production Serving Model

The application is deployed on Node.js (Google Cloud Run) using a hardened Express server architecture with explicit development and production modes.

### 1. Cloud Run / Node.js Production Startup

- **Production entry point:** `dist/server/server.cjs` (started via `npm start` or `bun start`).
- **Port binding:** Listens on `process.env.PORT` (supplied dynamically by Cloud Run), falling back to `3000` locally.
- **Host binding:** Explicitly binds to `0.0.0.0` for container ingress.
- **Independence from `NODE_ENV`:** The production server does not rely on an external `NODE_ENV=production` environment variable. Running the production start script (`npm start` / `node dist/server/server.cjs`) always launches the hardened static-serving stack and never initializes the Vite development server.

### 2. Development vs. Production Server Modes

| Mode | Command | Stack & Behavior |
| :--- | :--- | :--- |
| **Development** | `npm run dev` (`tsx server.ts --dev`) | Mounts Vite in middleware mode with client HMR and error logging. |
| **Production** | `npm start` (`node dist/server/server.cjs`) | Serves compiled browser assets, executes schema routing, handles SPA fallback. Zero Vite runtime dependency. |

Application construction (`createBaseApp`, `createProductionApp`) is decoupled from port binding (`startProductionServer`), enabling comprehensive integration testing via Supertest without binding a network port.

### 3. Client / Server Build Artifact Separation

The build pipeline (`npm run build`) strictly separates public browser assets from server runtime artifacts:

```
dist/
├── client/                      # Public static root (express.static)
│   ├── index.html               # SPA entry point
│   ├── assets/                  # Fingerprinted JS/CSS bundles
│   ├── manifest.webmanifest     # PWA manifest
│   ├── registerSW.js            # PWA registration
│   ├── sw.js                    # Service worker
│   └── workbox-*.js             # Workbox runtime
│
└── server/                      # Private server artifacts (isolated from HTTP)
    ├── server.cjs               # Bundled CommonJS server
    └── server.cjs.map           # Server source maps (if enabled)
```

- **Security Isolation:** `express.static` points strictly to `dist/client`. Server bundles and source maps are stored in `dist/server/` and are physically unreachable via HTTP requests. Requests to `/server.cjs` or `/server.cjs.map` never expose server implementation code.

### 4. Route Precedence & SPA Fallback

The Express middleware stack enforces strict execution order:

1. **`/schemas` Router (Highest Priority):**
   - Intercepts all requests matching `/schemas/*` before static or SPA middleware.
   - Serves canonical schemas, compound bundles, and human-facing HTML documentation.
   - **404 Handling:** Unmatched routes under `/schemas` return a dedicated 404 (JSON or HTML) and **never fall through** to the SPA shell `index.html`.
2. **Browser Static Middleware (`express.static('dist/client')`):**
   - Serves fingerprinted client assets, icons, and PWA service workers.
3. **SPA Fallback (`app.get('*')`):**
   - Routes all client navigation paths to `dist/client/index.html`.

### 5. Canonical Schema URIs & Documentation Paths

All JSON Schemas are published under canonical URIs with CORS (`Access-Control-Allow-Origin: *`) and immutable caching (`Cache-Control: public, max-age=31536000, immutable`):

| Schema / Resource | Canonical URI / HTTP Route | Content-Type |
| :--- | :--- | :--- |
| **NdefRecordV1** | `https://nfcweb.ai.studio/schemas/ndef-record/v1` | `application/schema+json` |
| **NfcTagV1** | `https://nfcweb.ai.studio/schemas/nfc-tag/v1` | `application/schema+json` |
| **NfcTagRegistryV1** | `https://nfcweb.ai.studio/schemas/nfc-tag-registry/v1` | `application/schema+json` |
| **NfcTagV1 Bundle** | `/schemas/nfc-tag/v1/bundle` | `application/schema+json` |
| **NfcTagRegistryV1 Bundle** | `/schemas/nfc-tag-registry/v1/bundle` | `application/schema+json` |
| **Directory Index** | `/schemas` | `text/html` |
| **Family Docs (NDEF)** | `/schemas/ndef-record` | `text/html` |
| **Family Docs (Tag)** | `/schemas/nfc-tag` | `text/html` |
| **Family Docs (Registry)**| `/schemas/nfc-tag-registry` | `text/html` |

### 6. Authority Boundary: Canonical Schemas vs. Generated Artifacts

- **Single Source of Truth:** The modular JSON Schemas in `src/data-format/schemas/` are the sole authoritative schema sources:
  - `src/data-format/schemas/ndef-record.schema.json`
  - `src/data-format/schemas/nfc-tag.schema.json`
  - `src/data-format/schemas/nfc-tag-registry.schema.json`
- **Derived Artifacts:**
  - `src/data-format/generated/bundles/*.bundle.json`: Compound schema documents embedding dependencies under `$defs`.
  - `src/data-format/generated/nfcweb-tag-registry.ts`: TypeScript interface declarations generated via `json-schema-to-typescript`.
- **Drift Prevention:** `npm run check:data-format` verifies that all generated files match the canonical schemas. If drift occurs, run `npm run generate:data-format`.

## Development & Build Lifecycle

```bash
# Verify schema sync, TypeScript types, automated tests, and production build
npm run check

# Individual lifecycle steps:
npm run check:data-format   # Verify schema bundles and generated TS match canonical schemas
npm run typecheck            # Check TypeScript types
npm test                     # Run unit and acceptance tests (Vitest)
npm run build                # Build client into dist/client and server into dist/server
npm start                    # Launch hardened production server

# Deployment acceptance & smoke checks:
bun run check:deployment -- https://nfcweb.ai.studio # Smoke check a deployed instance
```
