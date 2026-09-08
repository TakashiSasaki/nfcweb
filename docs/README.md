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
