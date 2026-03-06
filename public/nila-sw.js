/* public/sw.js */
// version 24
import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { clientsClaim } from 'workbox-core';
import { StaleWhileRevalidate } from 'workbox-strategies';

// take control ASAP
clientsClaim();
self.skipWaiting();
cleanupOutdatedCaches();

// make sure the app doesnt reload the old cache when registerValidSW in s..w...registration
self.addEventListener('message', evt => {
  if (evt.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window' });
      for (const client of all) {
        client.postMessage({
          type: 'APP_UPDATED',
          version: process.env.REACT_APP_VERSION,
          forceLogout: process.env.REACT_APP_FORCE_LOGOUT === 'true',
        });
      }
    })()
  );
});

// 1️⃣ precache all inject‑manifest assets + index.html
precacheAndRoute(self.__WB_MANIFEST);

// 2️⃣ Handle JS & CSS dynamically
registerRoute(
({ request }) =>
  request.destination === 'script' || request.destination === 'style',
new CacheFirst({
  cacheName: 'static-resources',
  plugins: [
    new ExpirationPlugin({
      maxEntries: 30,
      purgeOnQuotaError: true,
    }),
  ],
})
);
// 3️⃣ Images → CacheFirst
registerRoute(
  ({request}) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 100 })],
  })
);

// 4️⃣ favicon & manifest → StaleWhileRevalidate
registerRoute(
  ({url}) => url.pathname === '/manifest.json' || url.pathname === '/favicon.ico',
  new StaleWhileRevalidate({ cacheName: 'app-shell' })
);

// 5️⃣ SPA navigation fallback → index.html
registerRoute(
  ({request}) => request.mode === 'navigate',
  createHandlerBoundToURL('/index.html'),
);

// your existing push & notification handlers…
self.addEventListener('push', event => {
  let payload = {};
  let rawText = '';
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      rawText = event.data.text();
      payload = { body: rawText };
    }
  }

  console.log('[SW] push received', { payload, rawText });

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      client.postMessage({ type: 'PUSH_RECEIVED', payload, rawText });
    }

    const title = payload.title || payload.notification?.title || 'Nila';
    const options = {
      body: payload.body || payload.notification?.body || rawText || '',
      icon: payload.icon || payload.notification?.icon || '/nila192.png',
      badge: payload.badge || payload.notification?.badge || '/nila192.png',
      data: payload.data || payload.notification?.data || {},
    };

    await self.registration.showNotification(title, options);
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const client of clientsArr) {
        if ('focus' in client) {
          client.postMessage({ type: 'NILA_FROM_NOTIFICATION' });
          client.focus();
          if (client.navigate) return client.navigate(targetUrl);
          return undefined;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
