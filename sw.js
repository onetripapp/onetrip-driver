// OneTrip service worker — caches the app shell for basic offline capability.
// This is a cache-first strategy for the static shell only. Drive API calls
// and the Google Identity Services script are cross-origin ('cors' response
// type), and the fetch handler below only caches same-origin ('basic')
// responses, so they're never accidentally cached here — every upload
// attempt hits the real network.

// v2: added baselineReference.js. Deliberately does NOT eagerly cache
// assets/baseline-photos/** here — that's 17MB+ for one truck already, and
// growing. Those images pick up caching for free the first time they're
// actually requested, via the runtime cache-and-store logic in the fetch
// handler below — no separate cache-warming code needed.
const CACHE_NAME = 'onetrip-shell-v2';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/data.js',
  './js/baselineReference.js',
  './js/photoStore.js',
  './js/state.js',
  './js/drive.js',
  './js/app.js',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
