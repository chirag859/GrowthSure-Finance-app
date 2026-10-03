/* Bump CACHE_NAME on every deploy — this is what makes the "new version ready" toast fire. */
var CACHE_NAME = 'gs-finance-2026-10-03-ask';
var SHELL_URL = './index.html';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.add(SHELL_URL); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* Network-first for the page itself, so a client always gets the latest content
   when online, and only falls back to the cached copy when offline. */
self.addEventListener('fetch', function (event) {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(SHELL_URL, copy); });
      return response;
    }).catch(function () {
      return caches.match(SHELL_URL);
    })
  );
});
