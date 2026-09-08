import {readdir, readFile, mkdir, cp, writeFile, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {jsonLines} from '../docs/schema-core.js';

export function manifestEntry(schema, filename, options = {}) {
  if (!schema || typeof schema.$id !== 'string' || typeof schema.title !== 'string') throw Error(`Missing $id/title: ${filename}`);
  const uri = new URL(schema.$id);
  if (!['https:', 'http:'].includes(uri.protocol) || uri.hash) throw Error(`Invalid $id: ${filename}`);
  const parts = uri.pathname.split('/').filter(Boolean);
  const status = options.status || 'canonical';
  const json = options.json || `schemas/source/${encodeURIComponent(filename)}`;
  const sourcePath = options.sourcePath || `src/data-format/schemas/${filename}`;
  return {id: uri.href, title: schema.title, family: parts.at(-2), version: parts.at(-1), status,
    ...(options.designVersion ? {designVersion: options.designVersion} : {}),
    description: schema.description || '', json, sourcePath,
    refs: [...new Set(jsonLines(schema).filter(row => row.ref !== undefined).map(row => new URL(row.ref, row.scope).href))]};
}

async function readSchemaSet(source, optionsForFile) {
  const files = (await readdir(source)).filter(name => name.endsWith('.json')).sort();
  const schemas = await Promise.all(files.map(async file => {
    const schema = JSON.parse(await readFile(join(source, file), 'utf8'));
    return manifestEntry(schema, file, optionsForFile(file));
  }));
  return {files, schemas};
}

export async function build(root = process.cwd()) {
  const canonicalSource = join(root, 'src/data-format/schemas');
  const proposedV2Source = join(root, 'src/data-format/proposals/v2-alpha.1/schemas');
  const canonical = await readSchemaSet(canonicalSource, file => ({
    status: 'canonical',
    json: `schemas/source/${encodeURIComponent(file)}`,
    sourcePath: `src/data-format/schemas/${file}`
  }));
  if (!canonical.files.length) throw Error('No canonical schemas');
  const proposed = await readSchemaSet(proposedV2Source, file => ({
    status: 'proposed',
    designVersion: 'v2-alpha.1',
    json: `schemas/proposed/v2-alpha.1/${encodeURIComponent(file)}`,
    sourcePath: `src/data-format/proposals/v2-alpha.1/schemas/${file}`
  }));
  const schemas = [...canonical.schemas, ...proposed.schemas];
  if (new Set(schemas.map(s => s.id)).size !== schemas.length) throw Error('Duplicate schema $id');

  const site = join(root, '_site');
  await rm(site, {recursive: true, force: true});
  await mkdir(join(site, 'schemas/source'), {recursive: true});
  await mkdir(join(site, 'schemas/proposed/v2-alpha.1'), {recursive: true});

  // Explicit allowlist: never publish unrelated repository contents or test fixtures.
  for (const file of ['index.html', 'schema.html', 'source.html', 'schema.css', 'schema-core.js', 'schema-browser.js', 'source-browser.js']) {
    await cp(join(root, 'docs', file), join(site, file));
  }
  for (const file of canonical.files) await cp(join(canonicalSource, file), join(site, 'schemas/source', file));
  for (const file of proposed.files) await cp(join(proposedV2Source, file), join(site, 'schemas/proposed/v2-alpha.1', file));
  await cp(join(root, 'src/data-format/generated/bundles'), join(site, 'schemas/bundles'), {recursive: true});
  await writeFile(join(site, 'schema-manifest.json'), JSON.stringify({schemas}, null, 2) + '\n');
  await writeFile(join(site, '.nojekyll'), '');
  console.log(`Published ${canonical.schemas.length} canonical and ${proposed.schemas.length} proposed schema documents into _site`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await build();
