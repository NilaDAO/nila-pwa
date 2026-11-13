/* Nila lite offline (13 Nov): keeps the lite files on the phone, so the app opens without internet (a JioPhone often
 * has no data). Network first: online she always gets the latest files and the copy is refreshed; offline the kept copy
 * answers. Only the app's own files under /lite/: the node and the Stellar RPC are never cached here (her data is kept
 * by lite.js, marked "as of"). Plain ES5 for KaiOS 2.5 (Gecko 48). */
var CACHE = 'nila-lite-v1';
var FILES = ['/lite/', '/lite/index.html', '/lite/lite.css', '/lite/lite.js', '/lite/static.js', '/lite/qr.js',
  '/lite/session.js', '/lite/chain.js', '/lite/polygon.js', '/lite/manifest.webapp', '/lite/icon56.png', '/lite/icon112.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('nila-lite-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf('/lite/') !== 0) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
    }
    return res;
  }, function () {
    // Offline: the kept copy; a page load of any /lite/ route answers with the app's page.
    return caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || (req.mode === 'navigate' ? caches.match('/lite/index.html') : undefined);
    });
  }));
});
