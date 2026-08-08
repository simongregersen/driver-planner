importScripts('https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js');

// Only one Firebase project is used across dev/prod (see src/environments), so this
// config can be a static literal instead of templated per environment.
firebase.initializeApp({
  apiKey: 'AIzaSyBfU6bU7RifNOxm2XpxBHY8Z-yhwmRFthU',
  authDomain: 'driver-planner.firebaseapp.com',
  databaseURL: 'https://driver-planner.firebaseio.com',
  projectId: 'driver-planner',
  messagingSenderId: '825139309337',
  appId: 'TODO-fill-in-from-firebase-console',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification?.title ?? 'Driver Planner', {
    body: payload.notification?.body,
    icon: 'icons/icon-192x192.png',
    data: payload.data,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? '/'));
});

// Angular's service worker owns asset caching; load it last so it still controls fetch.
importScripts('./ngsw-worker.js');
