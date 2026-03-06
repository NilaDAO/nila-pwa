/* Minimal dev SW: no Workbox imports, for local notification testing. */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
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
