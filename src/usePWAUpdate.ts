import { useEffect } from 'react';

/**
 * Hook for PWA automatic update lifecycle.
 * When a new Service Worker is found and installed, it automatically invokes SKIP_WAITING
 * and cleanly reloads the window via controllerchange without requiring manual user intervention.
 */
export function usePWAUpdate() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let refreshing = false;

    // When the new service worker takes over, reload the window automatically
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    const triggerAutoUpdate = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting) {
        // Automatically skip waiting without requiring manual user prompt
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    };

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      // If a worker is already waiting, auto-activate immediately
      triggerAutoUpdate(reg);

      // Detect when a new service worker is installed and waiting
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            triggerAutoUpdate(reg);
          }
        });
      });
    });

    // Background update check on visibility change (returning to app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) {
            reg.update().catch(() => {});
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    // Periodic silent update check in background every 15 minutes
    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.update().catch(() => {});
        }
      });
    }, 15 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);
}

