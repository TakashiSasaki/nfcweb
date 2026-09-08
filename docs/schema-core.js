// Publication-only helpers. Canonical identifiers are never rewritten.
export const pointerPart = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
export function viewerURL(id, base, fragment = '') {
  const url = new URL('schema.html', base);
  url.searchParams.set('id', id);
  url.hash = fragment;
  return url.href;
}
export function resolveRef(ref, scope, schemas, base) {
  try {
    const uri = new URL(ref, scope);
    const fragment = uri.hash;
    uri.hash = '';
    const schema = schemas.find(item => item.id === uri.href);
    if (schema) return {kind: 'internal', href: viewerURL(schema.id, base, fragment), schema};
    const external = new URL(ref, scope);
    if (['https:', 'http:'].includes(external.protocol)) return {kind: 'external', href: external.href};
  } catch { /* Invalid or unsafe URI remains text. */ }
  return {kind: 'text'};
}
export function jsonLines(value, pointer = '', scope = '', depth = 0) {
  const rows = [];
  function visit(value, pointer, scope, depth, key, comma) {
    if (value && !Array.isArray(value) && typeof value === 'object' && typeof value.$id === 'string') {
      scope = new URL(value.$id, scope || undefined).href;
    }
    const object = value !== null && typeof value === 'object';
    const entries = object ? Object.entries(value) : [];
    const array = Array.isArray(value);
    const open = array ? '[' : '{', close = array ? ']' : '}';
    rows.push({pointer, scope, key, depth, anchor: object ? value.$anchor : undefined,
      type: object ? 'punctuation' : value === null ? 'null' : typeof value,
      text: object ? open + (entries.length ? '' : close) : JSON.stringify(value),
      ref: key === '$ref' && typeof value === 'string' ? value : undefined,
      comma: !entries.length && comma});
    entries.forEach(([k, v], i) => visit(v, `${pointer}/${pointerPart(k)}`, scope, depth + 1, array ? undefined : k, i < entries.length - 1));
    if (entries.length) rows.push({depth, text: close, type: 'punctuation', comma});
  }
  visit(value, pointer, scope, depth, undefined, false);
  return rows;
}
export function renderJSON(document, value, schemas, base) {
  const code = document.createElement('code');
  for (const row of jsonLines(value)) {
    const line = document.createElement('span');
    line.className = 'json-line';
    if (row.pointer !== undefined) line.dataset.pointer = row.pointer;
    if (typeof row.anchor === 'string') line.dataset.anchor = row.anchor;
    line.append('  '.repeat(row.depth));
    if (row.key !== undefined) {
      const key = document.createElement('span');
      key.className = 'token-key'; key.textContent = JSON.stringify(row.key);
      line.append(key, ': ');
    }
    const resolved = row.ref === undefined ? {} : resolveRef(row.ref, row.scope, schemas, base);
    const token = document.createElement(resolved.href ? 'a' : 'span');
    token.className = `token-${row.type}`;
    token.textContent = row.text;
    if (resolved.href) {
      token.href = resolved.href;
      token.title = resolved.kind === 'internal' ? 'View referenced schema' : 'External canonical reference';
    }
    line.append(token, row.comma ? ',\n' : '\n'); code.append(line);
  }
  return code;
}
export function fragmentTarget(hash) {
  try { return decodeURIComponent(hash.replace(/^#/, '')); } catch { return null; }
}
