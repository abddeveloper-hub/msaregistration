try {
  importScripts('./firebase-messaging-sw.js');
} catch (e) {
  console.warn('FCM SW import notice:', e);
}

const CACHE_NAME = 'msaukkuda-portal-v41';
const ASSETS = [
  './',
  './index.html',
  './achievements.html',
  './alumni.html',
  './events.html',
  './gallery.html',
  './videos.html',
  './library.html',
  './live.html',
  './login.html',
  './student.html',
  './teacher.html',
  './admin.html',
  './portal.html',
  './style.css',
  './mobile.css',
  './app.js',
  './achievements.js',
  './alumni.js',
  './events.js',
  './gallery.js',
  './videos.js',
  './library.js',
  './login.js',
  './student.js',
  './teacher.js',
  './admin.js',
  './portal.js',
  './firebase-config.js',
  './manifest.json',
  './assets/mdu-hero.png',
  './fonts/ArabQuranIslamic140-K7n4W.ttf',
  './fonts/ArabQuranIslamic140-vnmnZ.ttf'
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_SYSTEM_NOTIFICATION') {
    const { title, body, icon, link } = event.data;
    const notifTitle = title || 'MSA Portal';
    const absIcon = icon || new URL('icon-192.png', self.location.href).href;
    const notifOptions = {
      body: body || 'New announcement published.',
      icon: absIcon,
      badge: absIcon,
      vibrate: [300, 100, 300, 100, 300],
      tag: 'msa-sys-notif-' + Date.now(),
      renotify: true,
      requireInteraction: true,
      data: { url: link || './' }
    };
    self.registration.showNotification(notifTitle, notifOptions);
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'MSA Portal Announcement', body: 'You have a new notification.' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch(e) {
      data.body = event.data.text();
    }
  }
  const options = {
    body: data.body || data.message || '',
    icon: data.icon || './icon-192.png',
    badge: './icon-192.png',
    vibrate: [300, 100, 300, 100, 300],
    tag: 'msa-push-' + Date.now(),
    renotify: true,
    requireInteraction: true,
    data: { url: data.link || './' }
  };
  event.waitUntil(self.registration.showNotification(data.title || 'MSA Portal', options));
});


