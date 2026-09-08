# Schema browser

Canonical authority remains `src/data-format/schemas/*.json`. Do not edit generated
publication metadata or replace canonical `$id` / `$ref` values with Pages URLs.

Run `node --test tests/schema-docs.test.mjs` and
`node scripts/build-schema-docs.mjs` with Node 24. No dependency install is needed.
Serve `_site/` through a static HTTP server (including at a project prefix such as
`/nfcweb/`). Opening source HTML directly from disk is not supported because the
browser fetches publication metadata and JSON.

The builder discovers JSON files, inspects identifiers, rejects duplicate IDs,
copies raw files unchanged and creates `schema-manifest.json`. The manifest derives
family/version from the last two `$id` path segments and includes title,
description, raw JSON path and resolved references. It is a publication derivative,
not an input to the application or the canonical server.

`schema.html?id=<encoded canonical ID>#<fragment>` is a real static page.
All asset and navigation URLs resolve relative to the document, so root and project
Pages work without custom-domain configuration. Only manifest-known IDs resolve to
the viewer. Unknown HTTP(S) references link to their resolved canonical URLs in the
same tab; other schemes remain text. Browser Back and the overview link provide
return navigation. JSON Pointers (including escaped property names) and `$anchor`
fragments scroll to and mark the target line. Missing fragments show an explicit
message while retaining the entire document.

The renderer uses text nodes and `textContent`, never HTML parsed from schema text.
Keys, strings, numbers, booleans and null retain normal JSON punctuation as well as
distinct syntax styles. Focus outlines and a keyboard-focusable scrolling viewer
are included; colors follow the operating system's light/dark preference.

Raw files remain at `schemas/source/<original filename>.json`; existing generated
bundles remain at `schemas/bundles/`. Pages serves JSON files and HTML documentation;
it does not replace the Express `/schemas/<family>/<version>` endpoints or guarantee
their `application/schema+json` media type.

The workflow tests and builds the allowlisted `_site` artifact before upload.
Proposed v2 architecture remains explanatory; unpublished schema names have no
fabricated viewer routes. Future work: indexing nested `$id` resources and
`$dynamicRef` resolution. This is a document browser, not a JSON Schema validator;
the application's existing schema validation checks remain separate.
