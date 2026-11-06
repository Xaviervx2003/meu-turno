const CACHE_NAME = 'meu-turno-v20';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './css/styles.css',
  './js/storage.js',
  './js/calendar.js',
  './js/finance.js',
  './js/sheet.js',
  './js/ui.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Estratégia Network-First com fallback para Cache Offline e proteção contra Cache Poisoning/Bloat:
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          networkResponse.type === 'basic'
        ) {
          const clone = networkResponse.clone();
          // Normaliza a chave de cache sem query strings arbitrárias para evitar Cache Bloat
          const chaveCache = new Request(url.origin + url.pathname, { method: 'GET' });
          caches.open(CACHE_NAME).then((cache) => cache.put(chaveCache, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }))
  );
});
