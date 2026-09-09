# Schema browser

Canonical authority remains `src/data-format/schemas/*.json`. Proposed design
authority remains `src/data-format/proposals/v2-alpha.1/schemas/*.json`. Do not edit
generated publication metadata or replace schema `$id` / `$ref` values with Pages
URLs. `v2-alpha.1` is a proposal/design revision namespace, not a canonical schema
version.

Install the repository dependencies with `bun install --frozen-lockfile`, run
`bunx vitest run tests/schema-docs.test.mjs`, and build the publication with
`node scripts/build-schema-docs.mjs`. Serve `_site/` through a static HTTP server,
including at a project prefix such as `/nfcweb/`. Opening the HTML directly from disk
is not supported because the browser fetches publication metadata and JSON.

The overview has three tabs: Schema Browser (`#schemas`, the default), Schema
Architecture (`#architecture`), and Responsibilities (`#responsibilities`). Direct
links, reload, browser history, arrow keys, Home and End retain accessible selection.
Without JavaScript, explanatory sections remain visible and the manifest is linked.
Overview cards omit redundant Status rows and same-document dependencies; badges
and full individual-viewer metadata are retained.

## Deployment freshness

Pages passes `GITHUB_SHA` to the builder. Each build creates `site-version.json`
with a full revision and UTC `builtAt`; the same identity appears in all three HTML
pages and the service worker. Rebuilding the same commit creates a distinct identity.
Run `node scripts/check-schema-docs-artifact.mjs` before publishing `_site/`.
Local builds use revision `local` and do not register a documentation worker.

The common indicator displays the **currently viewed** revision and relative build
age, with absolute build time and verification time in its tooltip. Build time is
not deployment-completion time. Only a successful network identity match displays
“最新版”. Network/HTTP/metadata failures display “Offline copy · 最新版を確認できません”.
Initial load, online recovery, returning to a visible tab, and five-minute visible
checks verify freshness. Relative age updates every minute.

The documentation worker uses a cache per revision and build time. It bypasses HTTP
cache, serves content network-first, and uses only its current Cache Storage cache
as an offline fallback. `site-version.json` is network-only and never cached. Unique
verification queries also protect first-time migration through the old worker.
Installation refreshes the shell before skipWaiting; activation removes only old
`nfcweb-pages-` caches and claims clients. Registration uses `updateViaCache: none`.

On identity mismatch, one automatic reload per tab session is allowed after the
expected worker is active. The attempt is stored before recovery; storage denial,
worker-update failure, or continuing mismatch leaves a manual reload warning.
No controllerchange reload handler is used. Worker registration and automatic reload
are disabled in iframes, insecure contexts and local/unbuilt documentation. The
application's Vite PWA configuration and data storage are unaffected.

Regression tests cover tabs, freshness states, bounded recovery, worker behavior,
and artifact identity. Full repository validation is `bun run check`; the Pages
workflow runs the documentation suites and the artifact checker before upload.

## Published schema content

The builder discovers canonical and proposed JSON files from their separate authority
paths, inspects identifiers, rejects duplicate IDs, copies raw files byte-for-byte,
and creates `schema-manifest.json`. Each manifest entry contains schema identity and
metadata, the published raw JSON path, resolved references, status/design revision,
and the repository `sourcePath`. The manifest is a publication derivative, not an
input to the application or the canonical server.

The publication exposes three distinct reader surfaces:

- **View schema** — `schema.html?id=<encoded schema ID>#<fragment>` renders semantic
  schema metadata, relationships, and a formatted JSON Schema document. `$ref`
  navigation remains schema-aware.
- **View source** — `source.html?id=<encoded schema ID>` shows the repository source
  copy as code with original indentation, line numbers, syntax highlighting, source
  provenance, status/design badges, and links back to the schema view and raw JSON.
- **View raw JSON** — the undecorated published JSON resource for browsers and
  machines.

All asset and navigation URLs resolve relative to the document, so both root/custom
domain deployment and a GitHub Pages project prefix such as `/nfcweb/` work without
hard-coded deployment paths. Only manifest-known schema IDs resolve to the viewers.
Unknown HTTP(S) references link to their resolved canonical URLs; unsafe/non-web
schemes remain text. Browser Back and the overview link provide return navigation.
JSON Pointers (including escaped property names) and `$anchor` fragments scroll to
and mark the target line in the schema-document view.

Both renderers construct DOM with text nodes and `textContent`; schema/source strings
are never parsed as HTML. The source renderer tokenizes the already-published source
text rather than serializing parsed JSON, so repository indentation, scalar spelling,
and escaping are preserved. Focus outlines, keyboard-focusable scrolling viewers,
horizontal scrolling, and operating-system light/dark preferences are included.

Canonical raw JSON remains at `schemas/source/<original filename>.json`. Proposed
`v2-alpha.1` raw JSON is published at
`schemas/proposed/v2-alpha.1/<original filename>.json`. Existing generated bundles
remain at `schemas/bundles/`. The Pages artifact is built from an explicit allowlist;
the repository as a whole is never copied into it.

Pages serves JSON files and HTML documentation; it does not replace the Express
`/schemas/<family>/<version>` endpoints or guarantee their
`application/schema+json` media type. This is a document/source browser, not a JSON
Schema validator; the application's existing schema validation checks remain
separate. Future work may include indexing nested `$id` resources and `$dynamicRef`
resolution.
