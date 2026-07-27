importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyD8HJ3MD69rHz9opfiS3irqmbdfggKl0iQ",
    authDomain: "msa-registrtion.firebaseapp.com",
    projectId: "msa-registrtion",
    storageBucket: "msa-registrtion.firebasestorage.app",
    messagingSenderId: "312011015482",
    appId: "1:312011015482:web:4a56ddbccfcda4dbe57c03"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const title = payload.notification?.title || payload.data?.title || 'MSA Portal';
    const body = payload.notification?.body || payload.data?.body || payload.data?.message || 'New notification received.';
    
    const notificationOptions = {
        body: body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [300, 100, 300, 100, 300],
        tag: 'msa-bg-notif-' + Date.now(),
        renotify: true,
        requireInteraction: true,
        data: { url: payload.data?.link || './' }
    };

    self.registration.showNotification(title, notificationOptions);
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
