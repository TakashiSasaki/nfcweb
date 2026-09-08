import {viewerURL, resolveRef, renderJSON, fragmentTarget} from './schema-core.js';
const base = document.baseURI;
const status = document.getElementById('status');
const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
const link = (text, href) => { const node = element('a', text); node.href = href; return node; };
async function getJSON(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
}
function metadata(schema) {
  const dl = element('dl');
  for (const [name, value] of [['Family', schema.family], ['Version', schema.version], ['$id', schema.id], ['Description', schema.description]]) dl.append(element('dt', name), element('dd', value));
  return dl;
}
function refs(schema, schemas) {
  const list = element('ul');
  for (const ref of schema.refs) {
    const resolved = resolveRef(ref, schema.id, schemas, base);
    const item = element('li');
    const fragment = ref.includes('#') ? ref.slice(ref.indexOf('#')) : '';
    item.append(resolved.href ? link(resolved.schema ? resolved.schema.title + fragment : ref, resolved.href) : element('code', ref));
    list.append(item);
  }
  return list;
}
function highlight() {
  const target = fragmentTarget(location.hash);
  let found;
  for (const line of document.querySelectorAll('.json-line')) {
    const match = !!location.hash && (line.dataset.pointer === target || line.dataset.anchor === target);
    line.classList.toggle('selected', match);
    if (match) found = line;
  }
  found?.scrollIntoView({block: 'center'});
  status.textContent = location.hash && !found ? 'Fragment が見つかりません。schema 全体を表示しています。' : '';
}
try {
  const {schemas} = await getJSON('schema-manifest.json');
  const overview = document.getElementById('schema-list');
  if (overview) {
    for (const schema of schemas) {
      const card = element('article'); card.className = 'card';
      const title = element('h3'); title.append(link(schema.title, viewerURL(schema.id, base)));
      const actions = element('div'); actions.className = 'links';
      actions.append(link('View schema', viewerURL(schema.id, base)), link('View raw JSON', new URL(schema.json, base)));
      card.append(title, metadata(schema), actions);
      if (schema.refs.length) card.append(element('h4', '$ref dependencies'), refs(schema, schemas));
      overview.append(card);
    }
    status.textContent = `${schemas.length} canonical schemas`;
  } else {
    const id = new URL(location.href).searchParams.get('id');
    const schema = schemas.find(s => s.id === id);
    if (!schema) throw Error('Schema が見つかりません。overview から選択してください。');
    const value = await getJSON(schema.json);
    document.title = `${schema.title} — NFCWeb schemas`;
    document.getElementById('schema-title').textContent = value.title;
    document.getElementById('schema-meta').append(metadata(schema), link('View raw JSON', new URL(schema.json, base)));
    const relations = document.getElementById('relations');
    if (schema.refs.length) relations.append(element('h2', 'References'), refs(schema, schemas));
    const incoming = schemas.filter(s => s.id !== schema.id && s.refs.some(ref => resolveRef(ref, s.id, schemas, base).schema?.id === schema.id));
    if (incoming.length) {
      relations.append(element('h2', 'Referenced by'));
      for (const s of incoming) relations.append(link(s.title, viewerURL(s.id, base)), document.createTextNode(' '));
    }
    document.getElementById('json-viewer').append(renderJSON(document, value, schemas, base));
    highlight(); addEventListener('hashchange', highlight);
  }
} catch (error) { status.textContent = `読み込みに失敗しました: ${error.message}`; }
