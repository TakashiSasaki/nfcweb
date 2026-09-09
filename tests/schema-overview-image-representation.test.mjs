import {test, assert} from 'vitest';
import {readFile} from 'node:fs/promises';

test('schema overview separates representation usage, technical metadata, and provenance', async () => {
  const html = await readFile('docs/index.html', 'utf8');

  assert.match(html, /ImageRepresentationUseV1/);
  assert.match(html, /representations\[\] → ImageRepresentationUseV1/);
  assert.match(html, /purpose \+ representation → ImageRepresentationV1/);
  assert.match(html, /mediaType \/ dimensions \/ content → ByteSequenceV1/);
  assert.match(html, /display<\/code> \/ <code>thumbnail/);
  assert.match(html, /original<\/code> \/ <code>derived/);
  assert.match(html, /provenance \/ derivation/);
  assert.match(html, /TagPhotoV1\.purpose/);
  assert.doesNotMatch(html, /ImageRepresentation\.role/);
  assert.doesNotMatch(html, />role · mediaType · dimensions</);
});