const BUILD = {revision: '__BUILD_REVISION__', builtAt: '__BUILT_AT__'};
const CACHE_PREFIX = 'nfcweb-pages-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD.revision}-${BUILD.builtAt}`;
const SHELL_PATHS = [
  '', 'index.html', 'schema.html', 'source.html', 'schema.css', 'schema-core.js',
  'schema-tabs.js', 'schema-browser.js', 'source-browser.js',
  'service-worker-register.js', 'documentation-freshness.js', 'schema-manifest.json'
];
const scopeURL = new URL(self.registration.scope);
const scopedURL = path => new URL(path, scopeURL).href;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_PATHS.map(path => new Request(scopedURL(path), {cache: 'reload'})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'DOCUMENTATION_BUILD') event.ports[0]?.postMessage(BUILD);
});
self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scopeURL.origin || !url.pathname.startsWith(scopeURL.pathname)) return;
  // Freshness is never answered by Cache Storage, including when offline.
  if (url.pathname === new URL('site-version.json', scopeURL).pathname) {
    event.respondWith(fetch(request, {cache: 'no-store'}));
    return;
  }
  event.respondWith((async () => {
    let response;
    try { response = await fetch(request, {cache: 'no-store'}); }
    catch (networkError) {
      const cache = await caches.open(CACHE_NAME);
      const options = request.mode === 'navigate' ? {ignoreSearch: true} : undefined;
      const cached = await cache.match(request, options);
      if (cached) return cached;
      throw networkError;
    }
    if (response.ok && response.type === 'basic') {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      } catch { /* Storage quota/errors must not discard a successful network response. */ }
    }
    return response;
  })());
});
