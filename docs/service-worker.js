const CACHE_PREFIX = 'nfcweb-pages-';
const CACHE_NAME = `${CACHE_PREFIX}network-first-v1`;
const SHELL_PATHS = [
  '',
  'index.html',
  'schema.html',
  'source.html',
  'schema.css',
  'schema-core.js',
  'schema-tabs.js',
  'schema-browser.js',
  'source-browser.js',
  'service-worker-register.js',
  'schema-manifest.json'
];

const scopeURL = new URL(self.registration.scope);
const scopedURL = path => new URL(path, scopeURL).href;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_PATHS.map(scopedURL)))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(
      names
        .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map(name => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const {request} = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== scopeURL.origin || !url.pathname.startsWith(scopeURL.pathname)) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (networkError) {
      const options = request.mode === 'navigate' ? {ignoreSearch: true} : undefined;
      const cached = await caches.match(request, options);
      if (cached) return cached;
      throw networkError;
    }
  })());
});
