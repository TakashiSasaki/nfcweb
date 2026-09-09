export function publishedTopLevel(window, document) {
  const revision = document.querySelector('meta[name="nfcweb-build-revision"]')?.content;
  return window.top === window && window.isSecureContext && /^[a-f0-9]{40}$/.test(revision || '');
}
let registration;
export function registerDocumentationWorker(window, document) {
  if (!publishedTopLevel(window, document) || !('serviceWorker' in window.navigator)) return Promise.resolve(null);
  return window.navigator.serviceWorker.register(new URL('service-worker.js', document.baseURI), {updateViaCache: 'none'})
    .then(async value => { await value.update(); return value; });
}
// Recovery waits for the expected active worker, never reloads on controllerchange.
export async function prepareDocumentationUpdate(identity, window, registrationPromise = registration) {
  if (!('serviceWorker' in window.navigator)) return true;
  const work = (async () => {
    const value = await registrationPromise;
    if (!value) return false;
    await value.update();
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const worker = value.active;
      if (worker?.state === 'activated') {
        const matches = await new Promise(resolve => {
          const channel = new window.MessageChannel();
          const finish = result => { window.clearTimeout(timer); channel.port1.close(); channel.port2.close(); resolve(result); };
          const timer = window.setTimeout(() => finish(false), 500);
          channel.port1.onmessage = event => finish(event.data?.revision === identity.revision && event.data?.builtAt === identity.builtAt);
          worker.postMessage({type: 'DOCUMENTATION_BUILD'}, [channel.port2]);
        });
        if (matches) return true;
      }
      await new Promise(resolve => window.setTimeout(resolve, 100));
    }
    return false;
  })();
  let timer;
  try {
    return await Promise.race([work, new Promise(resolve => { timer = window.setTimeout(() => resolve(false), 10000); })]);
  } catch { return false; }
  finally { window.clearTimeout(timer); }
}
if (typeof window !== 'undefined') {
  registration = new Promise(resolve => {
    const start = () => resolve(registerDocumentationWorker(window, document).catch(error => {
      console.warn('NFCWeb Pages service worker update failed:', error);
      return null;
    }));
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, {once: true});
  });
}
