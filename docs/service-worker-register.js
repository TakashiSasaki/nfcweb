if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('service-worker.js', document.baseURI)).catch(error => {
      console.warn('NFCWeb Pages service worker registration failed:', error);
    });
  }, {once: true});
}
