import { useEffect } from 'react';

/**
 * Safe PWA update hook without infinite reload loops.
 */
export function usePWAUpdate() {
  useEffect(() => {
    // No-op to prevent reload loops in dev preview iframe
  }, []);
}


