// sw.js — Service Worker pour PWA offline-first
const CACHE_NAME = 'beatbox2midi-v26'; // sync avec APP_VERSION dans ui.js
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/ui.js',
  './src/audio.js',
  './src/model.js',
  './src/midi.js',
  './src/storage.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Stratégie : cache first, fallback réseau
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).catch(() => {
        // Offline et pas en cache : on abandonne
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
