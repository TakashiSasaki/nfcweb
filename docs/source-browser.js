import {viewerURL, renderSourceJSON} from './schema-core.js';

const base = document.baseURI;
const status = document.getElementById('status');
const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
const link = (text, href) => { const node = element('a', text); node.href = href; return node; };

async function getJSON(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
}
async function getText(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.text();
}
function badge(text, kind) {
  const node = element('span', text);
  node.className = `schema-status ${kind}`;
  return node;
}
function metadata(schema) {
  const dl = element('dl');
  const rows = [
    ['Status', schema.status === 'proposed' ? 'PROPOSED' : 'CANONICAL'],
    ...(schema.designVersion ? [['Design revision', schema.designVersion]] : []),
    ['Repository source path', schema.sourcePath],
    ['Family', schema.family],
    ['Schema version', schema.version],
    ['$id', schema.id]
  ];
  for (const [name, value] of rows) {
    const dd = element('dd');
    if (name === 'Repository source path' || name === '$id') dd.append(element('code', value)); else dd.textContent = value;
    dl.append(element('dt', name), dd);
  }
  return dl;
}

try {
  const {schemas} = await getJSON('schema-manifest.json');
  const id = new URL(location.href).searchParams.get('id');
  const schema = schemas.find(item => item.id === id);
  if (!schema) throw Error('Schema が見つかりません。overview から選択してください。');
  if (typeof schema.sourcePath !== 'string' || !schema.sourcePath) throw Error('Repository source provenance がありません。');

  const source = await getText(schema.json);
  const parsed = JSON.parse(source);
  if (parsed.$id !== schema.id) throw Error('Published source の $id が manifest と一致しません。');

  document.title = `${schema.title} source — NFCWeb schemas`;
  const heading = document.getElementById('source-title');
  heading.textContent = schema.title;
  heading.append(document.createTextNode(' '), badge(schema.status === 'proposed' ? 'PROPOSED' : 'CANONICAL', schema.status === 'proposed' ? 'proposed' : 'canonical'));
  if (schema.designVersion) heading.append(document.createTextNode(' '), badge(schema.designVersion, 'design'));

  const actions = element('div'); actions.className = 'links';
  actions.append(link('View schema', viewerURL(schema.id, base)), link('View raw JSON', new URL(schema.json, base)));
  document.getElementById('source-meta').append(metadata(schema), actions);

  const note = document.getElementById('source-note');
  note.textContent = schema.status === 'proposed'
    ? `これは ${schema.designVersion} proposal の repository source 公開コピーです。canonical authority ではありません。`
    : 'Canonical repository source の公開コピーです。表示時に再整形せず、公開された source text をそのままコード表示します。';

  document.getElementById('source-viewer').append(renderSourceJSON(document, source));
  status.textContent = '';
} catch (error) {
  status.textContent = `読み込みに失敗しました: ${error.message}`;
}
