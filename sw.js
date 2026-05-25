const CACHE_NAME = 'msaukkuda-portal-v11';
const ASSETS = [
  './',
  './index.html',
  './student.html',
  './teacher.html',
  './admin.html',
  './portal.html',
  './style.css',
  './mobile.css',
  './app.js',
  './student.js',
  './teacher.js',
  './admin.js',
  './portal.js',
  './firebase-config.js',
  './manifest.json',
  './assets/mdu-hero.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;
  const isFreshAsset = ['document', 'script', 'style'].includes(request.destination) ||
    ['.html', '.js', '.css'].some((ext) => requestUrl.pathname.endsWith(ext));

  if (request.mode === 'navigate' || isFreshAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('./index.html')))

    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      });
    })
  );
});
