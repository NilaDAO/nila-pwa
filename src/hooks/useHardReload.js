import { useCallback } from 'react';

// Especially helpful for PWA apps error handling, as SW will return cached content so same blank screen.
export function useHardReload() {
  return useCallback(async () => {
    // 1. Unregister all SWs
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map(r => r.unregister()));

    // 2. Clear all caches
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));

    // 3. Reload from network
    window.location.reload();
  }, []);
}