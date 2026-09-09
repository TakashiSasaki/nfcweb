import {test, expect, vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source = await readFile('docs/service-worker.js', 'utf8');
function setup() {
  const handlers = {};
  const cache = {addAll:vi.fn(async () => {}), put:vi.fn(async () => {}), match:vi.fn(async () => undefined)};
  const caches = {open:vi.fn(async () => cache), keys:vi.fn(async () => ['nfcweb-pages-old','unrelated-cache']), delete:vi.fn(async () => true)};
  const self = {registration:{scope:'https://example.org/nfcweb/'}, skipWaiting:vi.fn(async () => {}), clients:{claim:vi.fn(async () => {})}, addEventListener:(name, fn) => {handlers[name]=fn;}};
  const response = {ok:true, type:'basic', clone:() => 'copy'};
  const fetch = vi.fn(async () => response);
  runInNewContext(source.replaceAll('__BUILD_REVISION__','a'.repeat(40)).replaceAll('__BUILT_AT__','2026-09-09T01:00:00.000Z'), {self,caches,fetch,URL,Request});
  const request = (path, options={}) => {
    let promise;
    handlers.fetch({request:{method:'GET',url:`https://example.org/nfcweb/${path}`,mode:'cors',...options}, respondWith:p => {promise=p;}});
    return promise;
  };
  const lifecycle = name => {let promise; handlers[name]({waitUntil:p => {promise=p;}}); return promise;};
  return {cache,caches,self,fetch,response,request,lifecycle,handlers};
}
test('install uses deployment cache and bypassed shell requests, then activates immediately', async () => {
  const f=setup(); await f.lifecycle('install');
  expect(f.caches.open.mock.calls[0][0]).toBe(`nfcweb-pages-${'a'.repeat(40)}-2026-09-09T01:00:00.000Z`);
  const requests=f.cache.addAll.mock.calls[0][0];
  expect(requests.every(r => r.cache === 'reload')).toBe(true);
  expect(requests.some(r => r.url.includes('site-version.json'))).toBe(false);
  expect(f.self.skipWaiting).toHaveBeenCalledOnce();
  await f.lifecycle('activate');
  expect(f.caches.delete.mock.calls).toEqual([['nfcweb-pages-old']]);
  expect(f.self.clients.claim).toHaveBeenCalledOnce();
});
test('metadata is network-only even with an offline cached copy', async () => {
  const f=setup(); f.cache.match.mockResolvedValue('old metadata');
  f.fetch.mockRejectedValue(Error('offline'));
  await expect(f.request('site-version.json?freshness=unique')).rejects.toThrow('offline');
  expect(f.cache.match).not.toHaveBeenCalled(); expect(f.caches.open).not.toHaveBeenCalled();
  expect(f.fetch.mock.calls[0][1]).toEqual({cache:'no-store'});
});
test('HTML, manifest, scripts and schema JSON prefer network and tolerate cache write failure', async () => {
  const f=setup(); f.cache.put.mockRejectedValue(Error('quota'));
  for (const path of ['index.html','schema-manifest.json','schema-browser.js','schemas/source/example.json']) {
    expect(await f.request(path)).toBe(f.response);
  }
  expect(f.cache.match).not.toHaveBeenCalled();
  expect(f.fetch.mock.calls.every(([,init]) => init.cache==='no-store')).toBe(true);
});
test('offline fallback uses only current cache and preserves exact schema queries', async () => {
  const f=setup(); f.fetch.mockRejectedValue(Error('offline')); f.cache.match.mockResolvedValue('offline page');
  expect(await f.request('schema.html?id=example',{mode:'navigate'})).toBe('offline page');
  expect(f.cache.match.mock.calls[0][1]).toEqual({ignoreSearch:true});
  await f.request('schemas/source/example.json');
  expect(f.cache.match.mock.calls[1][1]).toBeUndefined();
  expect(f.caches.open.mock.calls.every(([name]) => name.includes('a'.repeat(40)))).toBe(true);
});
test('unrelated requests pass through; HTTP errors remain errors; worker reports its build', async () => {
  const f=setup();
  expect(f.request('index.html',{method:'POST'})).toBeUndefined();
  expect(f.request('',{url:'https://example.org/other/'})).toBeUndefined();
  expect(f.request('',{url:'https://other.org/nfcweb/'})).toBeUndefined();
  f.fetch.mockResolvedValue({ok:false,status:503});
  expect((await f.request('schema.html')).status).toBe(503);
  expect(f.cache.match).not.toHaveBeenCalled();
  const postMessage=vi.fn(); f.handlers.message({data:{type:'DOCUMENTATION_BUILD'},ports:[{postMessage}]});
  expect(postMessage.mock.calls[0][0].revision).toBe('a'.repeat(40));
});
