import {publishedTopLevel, prepareDocumentationUpdate} from './service-worker-register.js';

export function validIdentity(value) {
  return value && /^(?:[a-f0-9]{40}|local)$/.test(value.revision) &&
    typeof value.builtAt === 'string' && Number.isFinite(Date.parse(value.builtAt));
}
export function sameIdentity(left, right) {
  return left.revision === right.revision && left.builtAt === right.builtAt;
}
export function relativeBuildTime(builtAt, now = Date.now()) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(builtAt)) / 1000));
  if (!Number.isFinite(seconds)) return '日時不明';
  if (seconds < 60) return '数秒前';
  const [size, unit] = seconds < 3600 ? [60, 'minute'] : seconds < 86400 ? [3600, 'hour'] : [86400, 'day'];
  return new Intl.RelativeTimeFormat('ja', {numeric: 'always'}).format(-Math.floor(seconds / size), unit);
}

export function initializeFreshness(window, document, options = {}) {
  const container = document.getElementById('documentation-freshness');
  if (!container) return;
  const page = {
    revision: document.querySelector('meta[name="nfcweb-build-revision"]')?.content,
    builtAt: document.querySelector('meta[name="nfcweb-built-at"]')?.content
  };
  const fetcher = options.fetch ?? window.fetch.bind(window);
  const now = options.now ?? Date.now;
  const reload = options.reload ?? (() => window.location.reload());
  const prepare = options.prepare ?? (identity => prepareDocumentationUpdate(identity, window));
  let state = validIdentity(page) ? (page.revision === 'local' ? 'local' : 'checking') : 'unknown';
  let inflight, disposed = false, recovering = false, checkedAt;
  const label = document.createElement('span');
  label.setAttribute('role', 'status');
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = '再読み込み'; button.hidden = true;
  button.addEventListener('click', reload);
  container.replaceChildren(label, button);
  function render() {
    container.dataset.state = state;
    const labels = {checking:'確認中', latest:'✓ 最新版', stale:'新しい公開版があります', offline:'Offline copy · 最新版を確認できません', local:'ローカル版', unknown:'版情報を確認できません'};
    label.textContent = `${labels[state]} · ${relativeBuildTime(page.builtAt, now())} · revision ${(page.revision || 'unknown').slice(0, 7)}`;
    container.title = `Build: ${validIdentity(page) ? new Date(page.builtAt).toLocaleString('ja-JP', {timeZoneName:'short'}) : 'unknown'}\nRevision: ${page.revision || 'unknown'}${checkedAt ? `\n確認: ${new Date(checkedAt).toLocaleString('ja-JP')}` : ''}`;
    button.hidden = state !== 'stale';
  }
  async function recover(identity) {
    if (recovering || !publishedTopLevel(window, document)) return;
    const key = `nfcweb-docs-freshness-reload:${new URL('.', document.baseURI).pathname}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, 'attempted');
    } catch { return; }
    recovering = true;
    try { if (await prepare(identity) && !disposed && state === 'stale') reload(); }
    catch { /* Keep the explicit stale warning when worker update fails. */ }
  }
  async function verify() {
    if (disposed || state === 'local' || state === 'unknown') return;
    if (inflight) return inflight;
    inflight = (async () => {
      const controller = new window.AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      try {
        const url = new URL('site-version.json', document.baseURI);
        url.searchParams.set('freshness', `${now()}-${Math.random().toString(36).slice(2)}`);
        const response = await fetcher(url, {cache:'no-store', signal:controller.signal});
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const remote = await response.json();
        if (!validIdentity(remote) || remote.revision === 'local') throw Error('Invalid published identity');
        if (disposed) return;
        checkedAt = now();
        state = sameIdentity(page, remote) ? 'latest' : 'stale';
        render();
        if (state === 'stale') void recover(remote);
      } catch {
        if (!disposed) { state = 'offline'; render(); }
      } finally { window.clearTimeout(timer); }
    })();
    try { await inflight; } finally { inflight = null; }
  }
  const online = () => { void verify(); };
  const offline = () => { if (!['local', 'unknown'].includes(state)) { state = 'offline'; render(); } };
  const visible = () => { if (document.visibilityState === 'visible') void verify(); };
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  document.addEventListener('visibilitychange', visible);
  const displayTimer = window.setInterval(render, 60000);
  const verifyTimer = window.setInterval(visible, 300000);
  render(); void verify();
  return {verify, dispose() {
    disposed = true;
    window.clearInterval(displayTimer); window.clearInterval(verifyTimer);
    window.removeEventListener('online', online); window.removeEventListener('offline', offline);
    document.removeEventListener('visibilitychange', visible);
  }};
}
if (typeof window !== 'undefined') initializeFreshness(window, document);
