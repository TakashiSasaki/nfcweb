import {readdir, readFile, mkdir, cp, writeFile, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {jsonLines} from '../docs/schema-core.js';

export function manifestEntry(schema, filename) {
  if (!schema || typeof schema.$id !== 'string' || typeof schema.title !== 'string') throw Error(`Missing $id/title: ${filename}`);
  const uri = new URL(schema.$id);
  if (!['https:', 'http:'].includes(uri.protocol) || uri.hash) throw Error(`Invalid $id: ${filename}`);
  const parts = uri.pathname.split('/').filter(Boolean);
  return {id: uri.href, title: schema.title, family: parts.at(-2), version: parts.at(-1),
    description: schema.description || '', json: `schemas/source/${encodeURIComponent(filename)}`,
    refs: [...new Set(jsonLines(schema).filter(row => row.ref !== undefined).map(row => new URL(row.ref, row.scope).href))]};
}
export async function build(root = process.cwd()) {
  const source = join(root, 'src/data-format/schemas');
  const files = (await readdir(source)).filter(name => name.endsWith('.json')).sort();
  if (!files.length) throw Error('No canonical schemas');
  const schemas = await Promise.all(files.map(async file => manifestEntry(JSON.parse(await readFile(join(source, file), 'utf8')), file)));
  if (new Set(schemas.map(s => s.id)).size !== schemas.length) throw Error('Duplicate canonical $id');
  const site = join(root, '_site');
  await rm(site, {recursive: true, force: true});
  await mkdir(join(site, 'schemas/source'), {recursive: true});
  // Explicit allowlist: never publish repository contents or test fixtures.
  for (const file of ['index.html', 'schema.html', 'schema.css', 'schema-core.js', 'schema-browser.js']) await cp(join(root, 'docs', file), join(site, file));
  for (const file of files) await cp(join(source, file), join(site, 'schemas/source', file));
  await cp(join(root, 'src/data-format/generated/bundles'), join(site, 'schemas/bundles'), {recursive: true});
  await writeFile(join(site, 'schema-manifest.json'), JSON.stringify({schemas}, null, 2) + '\n');
  await writeFile(join(site, '.nojekyll'), '');
  console.log(`Published ${schemas.length} schema documents into _site`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await build();
