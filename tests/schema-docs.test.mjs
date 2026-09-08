import {test, assert} from 'vitest';
import {readFile, readdir} from 'node:fs/promises';
import {viewerURL, resolveRef, jsonLines, renderJSON, fragmentTarget} from '../docs/schema-core.js';
import {manifestEntry, build} from '../scripts/build-schema-docs.mjs';
const id = 'https://nfcweb.ai.studio/schemas/example/v1';
const schemas = [{id}];
const proposedFilesExpected = [
  'byte-sequence.schema.json',
  'image-asset.schema.json',
  'image-representation.schema.json',
  'nfc-tag-registry.schema.json',
  'nfc-tag.schema.json',
  'tag-photo.schema.json'
];
test('viewer URLs retain project and custom domain base paths', () => {
  for (const base of ['https://example.org/nfcweb/index.html', 'https://example.org/index.html']) {
    const url = new URL(viewerURL(id, base, '#/$defs/foo'));
    assert.equal(url.pathname, new URL('schema.html', base).pathname);
    assert.equal(url.searchParams.get('id'), id);
    assert.equal(url.hash, '#/$defs/foo');
    assert.equal(resolveRef(id, id, schemas, base).href, viewerURL(id, base));
  }
});
test('internal, relative, external and unsafe references', () => {
  const base = 'https://example.org/nfcweb/';
  for (const ref of [id + '#text', '#text', './v1#text']) {
    const result = resolveRef(ref, id, schemas, base);
    assert.equal(result.kind, 'internal'); assert.equal(new URL(result.href).hash, '#text');
  }
  assert.deepEqual(resolveRef('https://other.org/schema#foo', id, schemas, base), {kind:'external', href:'https://other.org/schema#foo'});
  for (const ref of ['javascript:alert(1)', 'data:text/html,x', 'file:///secret', 'http://[']) assert.equal(resolveRef(ref, id, schemas, base).kind, 'text');
});
test('pretty JSON preserves every JSON type, indentation, escaped keys and anchors', () => {
  const value = {$id:id, $defs:{'a/b~c':{$anchor:'foo', value:[null, true, false, 1.2, 'line\n"<>&', {}, []]}}};
  const rows = jsonLines(value);
  const text = rows.map(r => '  '.repeat(r.depth) + (r.key === undefined ? '' : JSON.stringify(r.key) + ': ') + r.text + (r.comma ? ',' : '')).join('\n');
  assert.equal(text, JSON.stringify(value, null, 2));
  assert.ok(rows.some(r => r.pointer === '/$defs/a~1b~0c' && r.anchor === 'foo'));
  assert.equal(fragmentTarget('#/%24defs/a~1b~0c'), '/$defs/a~1b~0c');
  assert.equal(fragmentTarget('#%ZZ'), null);
});
test('renderer only creates text nodes, never HTML from schema strings', () => {
  // Deliberately narrow DOM adapter: using an HTML sink fails this test.
  const nodes = [];
  const document = {createElement(tag) { const n = {tag, dataset:{}, children:[], append(...c){this.children.push(...c)}, set innerHTML(v){throw Error('Unsafe HTML sink')}, set textContent(v){this.children=[v]}}; nodes.push(n); return n; }};
  const attack = '</span><img src=x onerror=alert(1)>';
  renderJSON(document, {$id:id, [attack]:attack, $ref:'javascript:alert(1)'}, schemas, 'https://example.org/nfcweb/');
  assert.ok(nodes.some(n => n.children.includes(JSON.stringify(attack))));
  assert.ok(nodes.every(n => ['span', 'code'].includes(n.tag)));
});
test('manifest derives identity and records repository source provenance', () => {
  const entry = manifestEntry({$id:id, title:'Example', description:'Example schema', $ref:'#foo'}, 'example.json');
  assert.equal(entry.family, 'example'); assert.equal(entry.version, 'v1');
  assert.equal(entry.sourcePath, 'src/data-format/schemas/example.json');
  assert.deepEqual(entry.refs, [id + '#foo']);
  assert.throws(() => manifestEntry({title:'No ID'}, 'x.json'));
  assert.throws(() => manifestEntry({$id:'javascript:x', title:'Bad'}, 'x.json'));
});
test('artifact includes canonical and proposed schemas byte-for-byte with unchanged ids and provenance', async () => {
  await build();
  const {schemas} = JSON.parse(await readFile('_site/schema-manifest.json', 'utf8'));
  const canonicalFiles = (await readdir('src/data-format/schemas')).filter(f => f.endsWith('.json')).sort();
  const proposedFiles = (await readdir('src/data-format/proposals/v2-alpha.1/schemas')).filter(f => f.endsWith('.json')).sort();
  assert.deepEqual(proposedFiles, proposedFilesExpected);
  const canonicalSchemas = schemas.filter(schema => schema.status === 'canonical');
  const proposedSchemas = schemas.filter(schema => schema.status === 'proposed');
  assert.equal(canonicalSchemas.length, canonicalFiles.length);
  assert.equal(proposedSchemas.length, proposedFiles.length);
  assert.equal(schemas.length, canonicalFiles.length + proposedFiles.length);
  for (const file of canonicalFiles) {
    const sourcePath = `src/data-format/schemas/${file}`;
    const source = await readFile(sourcePath);
    const entry = canonicalSchemas.find(schema => schema.sourcePath === sourcePath);
    assert.ok(entry, `missing canonical provenance for ${file}`);
    assert.equal(entry.designVersion, undefined);
    assert.equal(entry.id, JSON.parse(source.toString('utf8')).$id);
    assert.deepEqual(await readFile(`_site/schemas/source/${file}`), source);
  }
  for (const file of proposedFiles) {
    const sourcePath = `src/data-format/proposals/v2-alpha.1/schemas/${file}`;
    const source = await readFile(sourcePath);
    const entry = proposedSchemas.find(schema => schema.sourcePath === sourcePath);
    assert.ok(entry, `missing proposed provenance for ${file}`);
    assert.equal(entry.designVersion, 'v2-alpha.1');
    assert.equal(entry.id, JSON.parse(source.toString('utf8')).$id);
    assert.deepEqual(await readFile(`_site/schemas/proposed/v2-alpha.1/${file}`), source);
  }
  assert.deepEqual((await readdir('_site')).sort(), ['.nojekyll','index.html','schema-browser.js','schema-core.js','schema-manifest.json','schema.css','schema.html','schemas'].sort());
});
test('light and dark text colors meet WCAG AA contrast on viewer panels', async () => {
  const css = await readFile('docs/schema.css', 'utf8');
  const luminance = hex => {
    if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
    const channels = hex.match(/../g).map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return channels.reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  };
  for (const block of css.matchAll(/:root\{([^}]+)\}/g)) {
    const colors = Object.fromEntries([...block[1].matchAll(/--([a-z]+):#([0-9a-f]+)/g)].map(m => [m[1], luminance(m[2])]));
    for (const name of ['text','muted','accent','key','string','literal']) {
      const ratio = (Math.max(colors[name], colors.panel) + .05) / (Math.min(colors[name], colors.panel) + .05);
      assert.ok(ratio >= 4.5, `${name}: ${ratio}`);
    }
  }
});
