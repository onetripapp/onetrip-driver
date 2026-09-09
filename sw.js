// OneTrip service worker — caches the app shell for basic offline capability.
// This is a cache-first strategy for the static shell only. Calls to the
// Drive-upload Cloud Function are cross-origin ('cors' response type), and
// the fetch handler below only caches same-origin ('basic') responses, so
// they're never accidentally cached here — every upload attempt hits the
// real network.

// v5: UI restyle added css/tokens.css as a separate stylesheet. The Google
// Fonts stylesheet/font files themselves are cross-origin and deliberately
// NOT cached here (same reasoning as the Drive calls below) — offline
// visits fall back to the system serif/sans in tokens.css's font stacks
// rather than breaking. Deliberately does NOT eagerly cache
// assets/baseline-photos/** here — that's 17MB+ for one truck already, and
// growing. Those images pick up caching for free the first time they're
// actually requested, via the runtime cache-and-store logic in the fetch
// handler below — no separate cache-warming code needed.
//
// v6: second UI restyle (white/ink/gold token system, shield-checkmark
// mark) — every SHELL_FILES entry below changed. This version bump is the
// only thing that makes any already-installed service worker notice: the
// browser only re-runs install/activate when sw.js's own bytes change, so
// without it every device that had ever loaded the app before would stay
// on the v5 cache — and therefore the old dark theme — forever, no matter
// how many times it reloads.
const CACHE_NAME = 'onetrip-shell-v6';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/style.css',
  './js/auth.js',
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
