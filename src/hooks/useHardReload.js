import { useCallback } from 'react';

// Force the freshest bundle in front of the user without destroying state.
// IMPORTANT: must NOT touch IndexedDB (APPDB) or localStorage. APPDB holds the
// JWT/refresh/salt that gate the wallet; wiping it looks like an account reset.
//
// Strategy: ask the SW to check for an update, promote any waiting worker via
// SKIP_WAITING (the controllerchange listener in serviceWorkerRegistration.js
// will then reload), and otherwise just reload the page. The SW itself stays
// registered — dropping the controller is what causes the cold-boot
// "empty wallet" flash on Android PWA.
export function useHardReload() {
  return useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) {
        // Ask the SW to look for a new build.
        try { await reg.update(); } catch (e) { /* offline / network error — ignore */ }

        // If a new SW is waiting, hand control over. The existing
        // controllerchange listener will reload the page once it takes over.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          return;
        }
      }
    } catch (err) {
      console.warn('useHardReload: SW update check failed', err);
    }

    // No waiting SW — plain reload. IndexedDB and localStorage are untouched.
    window.location.reload();
  }, []);
}