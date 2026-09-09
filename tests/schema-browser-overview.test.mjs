import {test, assert} from 'vitest';
import {readFile} from 'node:fs/promises';
import {isExternalDocumentRef} from '../docs/schema-core.js';

const id = 'https://nfcweb.ai.studio/schemas/example/v1';

test('overview dependency filtering excludes same-document fragment references', () => {
  for (const ref of [
    '#/$defs/local',
    `${id}#/$defs/local`,
    './v1#/$defs/local'
  ]) {
    assert.equal(isExternalDocumentRef(ref, id), false, ref);
  }

  for (const ref of [
    'https://nfcweb.ai.studio/schemas/other/v1',
    'https://nfcweb.ai.studio/schemas/other/v1#/$defs/item',
    '../other/v1#item',
    'https://example.org/schema#item'
  ]) {
    assert.equal(isExternalDocumentRef(ref, id), true, ref);
  }

  assert.equal(isExternalDocumentRef('http://[', id), false);
});

test('schema overview cards omit redundant status metadata and filter dependencies only on overview', async () => {
  const source = await readFile('docs/schema-browser.js', 'utf8');
  assert.match(source, /metadata\(schema, \{includeStatus: false\}\)/);
  assert.match(source, /schema\.refs\.filter\(ref => isExternalDocumentRef\(ref, schema\.id\)\)/);
  assert.match(source, /refs\(schema, schemas, dependencyRefs\)/);
  assert.match(source, /schema-meta'\)\.append\(metadata\(schema\), actions\)/);
  assert.match(source, /if \(schema\.refs\.length\) relations\.append\(element\('h2', 'References'\), refs\(schema, schemas\)\)/);
});
