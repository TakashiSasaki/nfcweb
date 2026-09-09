import {test, expect, vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {initializeFreshness, relativeBuildTime, sameIdentity} from '../docs/documentation-freshness.js';
import {publishedTopLevel, registerDocumentationWorker, prepareDocumentationUpdate} from '../docs/service-worker-register.js';

const page = {revision:'a'.repeat(40), builtAt:'2026-09-09T01:00:00.000Z'};
const newer = {...page, revision:'b'.repeat(40)};
const response = identity => ({ok:true, json:async () => identity});
function setup(remote = page, options = {}, identity = page) {
  const dom = new JSDOM(`<meta name="nfcweb-build-revision" content="${identity.revision}"><meta name="nfcweb-built-at" content="${identity.builtAt}"><div id="documentation-freshness"></div>`, {url:'https://example.org/nfcweb/#architecture', pretendToBeVisual:true});
  Object.defineProperty(dom.window, 'isSecureContext', {value:true});
  const fetch = vi.fn(async () => response(remote));
  const reload = vi.fn(), prepare = vi.fn(async () => true);
  const w = dom.window, d = w.document;
  const config = {fetch, reload, prepare, now:() => Date.parse(page.builtAt) + 240000, ...options};
  const app = initializeFreshness(w, d, config);
  return {dom, w, d, fetch, reload, prepare, config, app, node:d.getElementById('documentation-freshness'), close() {app.dispose(); dom.window.close();}};
}
test('latest requires a successful bypassed network verification and retains page identity', async () => {
  const f = setup();
  expect(f.node.dataset.state).toBe('checking');
  await f.app.verify();
  expect(f.node.dataset.state).toBe('latest');
  expect(f.node.textContent).toContain('4 分前');
  expect(f.node.textContent).toContain('aaaaaaa');
  expect(f.node.title).toContain(page.revision);
  expect(f.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = f.fetch.mock.calls[0];
  expect(url.pathname).toBe('/nfcweb/site-version.json');
  expect(url.searchParams.has('freshness')).toBe(true);
  expect(init.cache).toBe('no-store');
  expect(f.reload).not.toHaveBeenCalled();
  f.close();
});
test('stale reload is bounded across reinitialization in the same session', async () => {
  const f = setup(newer); await f.app.verify();
  await vi.waitFor(() => expect(f.reload).toHaveBeenCalledTimes(1));
  expect(f.node.dataset.state).toBe('stale');
  expect(f.node.querySelector('button').hidden).toBe(false);
  expect(f.node.textContent).toContain('aaaaaaa');
  f.app.dispose();
  const second = initializeFreshness(f.w, f.d, f.config);
  await second.verify(); await second.verify();
  expect(f.reload).toHaveBeenCalledTimes(1);
  expect(f.w.location.hash).toBe('#architecture');
  second.dispose(); f.close();
});
test('rebuild of the same revision is a distinct deployment', async () => {
  const rebuilt = {...page, builtAt:'2026-09-09T02:00:00.000Z'};
  expect(sameIdentity(page, rebuilt)).toBe(false);
  const f = setup(rebuilt); await f.app.verify();
  expect(f.node.dataset.state).toBe('stale'); f.close();
});
test('network, HTTP and invalid metadata errors never claim latest', async () => {
  for (const fetch of [async () => {throw Error('offline');}, async () => ({ok:false}), async () => response({}), async () => response({...page, builtAt:'bad'}), async () => response({...page, revision:'local'})]) {
    const f = setup(page, {fetch}); await f.app.verify();
    expect(f.node.dataset.state).toBe('offline');
    expect(f.node.textContent).toContain('Offline copy');
    expect(f.reload).not.toHaveBeenCalled(); f.close();
  }
});
test('offline event clears latest and online/visibility verification discovers updates', async () => {
  const f = setup(); await f.app.verify();
  f.w.dispatchEvent(new f.w.Event('offline'));
  expect(f.node.dataset.state).toBe('offline');
  f.w.dispatchEvent(new f.w.Event('online')); await f.app.verify();
  expect(f.node.dataset.state).toBe('latest');
  f.fetch.mockResolvedValue(response(newer));
  f.d.dispatchEvent(new f.w.Event('visibilitychange')); await f.app.verify();
  expect(f.node.dataset.state).toBe('stale');
  const urls = f.fetch.mock.calls.map(([url]) => url.href);
  expect(new Set(urls).size).toBe(urls.length); f.close();
});
test('failed worker update keeps warning; blocked session storage suppresses automatic reload', async () => {
  const f = setup(newer, {prepare:async () => false}); await f.app.verify();
  expect(f.node.dataset.state).toBe('stale'); expect(f.reload).not.toHaveBeenCalled(); f.close();
  const g = setup(); await g.app.verify();
  Object.defineProperty(g.w, 'sessionStorage', {get() {throw Error('denied');}});
  g.fetch.mockResolvedValue(response(newer)); await g.app.verify();
  expect(g.node.dataset.state).toBe('stale'); expect(g.reload).not.toHaveBeenCalled(); g.close();
});
test('local and missing identities skip network claims; preview iframe never registers or reloads', async () => {
  for (const identity of [{...page, revision:'local'}, {...page, revision:'__BUILD_REVISION__'}]) {
    const f = setup(page, {}, identity); await f.app.verify();
    expect(['local','unknown']).toContain(f.node.dataset.state);
    expect(f.fetch).not.toHaveBeenCalled(); f.close();
  }
  const f = setup(); await f.app.verify();
  const frame = f.d.createElement('iframe'); f.d.body.append(frame);
  const w = frame.contentWindow;
  w.document.head.innerHTML = f.d.head.innerHTML;
  w.document.body.innerHTML = '<div id="documentation-freshness"></div>';
  Object.defineProperty(w, 'isSecureContext', {value:true});
  const register = vi.fn(); Object.defineProperty(w.navigator, 'serviceWorker', {value:{register}});
  expect(publishedTopLevel(w, w.document)).toBe(false);
  expect(await registerDocumentationWorker(w, w.document)).toBeNull();
  const app = initializeFreshness(w, w.document, {...f.config, fetch:async () => response(newer)});
  await app.verify();
  expect(w.document.getElementById('documentation-freshness').dataset.state).toBe('stale');
  expect(register).not.toHaveBeenCalled(); expect(f.reload).not.toHaveBeenCalled();
  app.dispose(); f.close();
});
test('registration bypasses HTTP cache and checks for updates', async () => {
  const f = setup(); await f.app.verify();
  const update = vi.fn(async () => {}), register = vi.fn(async () => ({update}));
  Object.defineProperty(f.w.navigator, 'serviceWorker', {value:{register}});
  await registerDocumentationWorker(f.w, f.d);
  expect(register.mock.calls[0][0].pathname).toBe('/nfcweb/service-worker.js');
  expect(register.mock.calls[0][1]).toEqual({updateViaCache:'none'});
  expect(update).toHaveBeenCalledOnce(); f.close();
});
test('relative build age covers seconds, minute, hour, day and invalid timestamps', () => {
  const then = Date.parse(page.builtAt);
  for (const [seconds, expected] of [[59,'数秒前'],[60,'1 分前'],[3599,'59 分前'],[3600,'1 時間前'],[86400,'1 日前']]) expect(relativeBuildTime(page.builtAt, then + seconds*1000)).toBe(expected);
  expect(relativeBuildTime('bad')).toBe('日時不明');
});
test('recovery waits for the expected worker identity and fails closed on update errors or timeout', async () => {
  vi.useFakeTimers();
  try {
    let activeBuild = page;
    const window = {navigator:{serviceWorker:{}}, setTimeout, clearTimeout, MessageChannel:class {
      constructor() {
        this.port1 = {close() {}};
        this.port2 = {close() {}, reply: data => this.port1.onmessage({data})};
      }
    }};
    const active = {state:'activated', postMessage:(_message, [port]) => port.reply(activeBuild)};
    const update = vi.fn(async () => {});
    expect(await prepareDocumentationUpdate(page, window, Promise.resolve({active, update}))).toBe(true);
    activeBuild = newer;
    const mismatch = prepareDocumentationUpdate(page, window, Promise.resolve({active, update}));
    await vi.runAllTimersAsync();
    expect(await mismatch).toBe(false);
    expect(await prepareDocumentationUpdate(page, window, Promise.resolve({update:async () => {throw Error('offline');}}))).toBe(false);
    const stalled = prepareDocumentationUpdate(page, window, new Promise(() => {}));
    await vi.runAllTimersAsync();
    expect(await stalled).toBe(false);
  } finally { vi.useRealTimers(); }
});
