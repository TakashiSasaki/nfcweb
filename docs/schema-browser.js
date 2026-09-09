import './service-worker-register.js';
import {viewerURL, sourceURL, resolveRef, isExternalDocumentRef, renderJSON, fragmentTarget} from './schema-core.js';
const base = document.baseURI;
const status = document.getElementById('status');
const element = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
const link = (text, href) => { const node = element('a', text); node.href = href; return node; };
async function getJSON(path) {
  const response = await fetch(new URL(path, base));
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
}
function metadata(schema, {includeStatus = true} = {}) {
  const dl = element('dl');
  const statusLabel = schema.status === 'proposed' ? 'Proposed design' : 'Canonical';
  const rows = [];
  if (includeStatus) rows.push(['Status', statusLabel]);
  if (schema.designVersion) rows.push(['Design revision', schema.designVersion]);
  rows.push(['Family', schema.family], ['Version', schema.version], ['$id', schema.id], ['Description', schema.description]);
  for (const [name, value] of rows) dl.append(element('dt', name), element('dd', value));
  return dl;
}
function statusBadge(schema) {
  const badge = element('span', schema.status === 'proposed' ? 'PROPOSED' : 'CANONICAL');
  badge.className = `schema-status ${schema.status === 'proposed' ? 'proposed' : 'canonical'}`;
  return badge;
}
function designBadge(schema) {
  if (!schema.designVersion) return null;
  const badge = element('span', schema.designVersion);
  badge.className = 'schema-status design';
  return badge;
}
function appendBadges(node, schema) {
  node.append(document.createTextNode(' '), statusBadge(schema));
  const design = designBadge(schema);
  if (design) node.append(document.createTextNode(' '), design);
}
function refs(schema, schemas, refValues = schema.refs) {
  const list = element('ul');
  for (const ref of refValues) {
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
      const card = element('article'); card.className = `card schema-card ${schema.status === 'proposed' ? 'proposed' : 'canonical'}`;
      const title = element('h3');
      title.append(link(schema.title, viewerURL(schema.id, base))); appendBadges(title, schema);
      const actions = element('div'); actions.className = 'links';
      actions.append(
        link('View schema', viewerURL(schema.id, base)),
        link('View source', sourceURL(schema.id, base)),
        link('View raw JSON', new URL(schema.json, base))
      );
      card.append(title, metadata(schema, {includeStatus: false}), actions);
      const dependencyRefs = schema.refs.filter(ref => isExternalDocumentRef(ref, schema.id));
      if (dependencyRefs.length) card.append(element('h4', '$ref dependencies'), refs(schema, schemas, dependencyRefs));
      overview.append(card);
    }
    const canonicalCount = schemas.filter(s => s.status !== 'proposed').length;
    const proposed = schemas.filter(s => s.status === 'proposed');
    const designVersions = [...new Set(proposed.map(s => s.designVersion).filter(Boolean))];
    const proposedLabel = designVersions.length === 1 ? `${proposed.length} proposed schemas (${designVersions[0]})` : `${proposed.length} proposed schemas`;
    status.textContent = `${canonicalCount} canonical schemas · ${proposedLabel}`;
  } else {
    const id = new URL(location.href).searchParams.get('id');
    const schema = schemas.find(s => s.id === id);
    if (!schema) throw Error('Schema が見つかりません。overview から選択してください。');
    const value = await getJSON(schema.json);
    document.title = `${schema.title} — NFCWeb schemas`;
    const heading = document.getElementById('schema-title');
    heading.textContent = value.title; appendBadges(heading, schema);
    const actions = element('div'); actions.className = 'links';
    actions.append(link('View source', sourceURL(schema.id, base)), link('View raw JSON', new URL(schema.json, base)));
    document.getElementById('schema-meta').append(metadata(schema), actions);
    const note = document.getElementById('schema-note');
    if (note) note.textContent = schema.status === 'proposed'
      ? `これは ${schema.designVersion || 'development'} の提案スキーマです。canonical data-format の authority ではありません。$ref は同じ viewer 内で追跡できます。`
      : 'Canonical JSON の公開ミラーです。参照リンクは viewer に移動しますが、JSON の URI は変更していません。';
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
