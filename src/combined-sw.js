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
  appId: '1:825139309337:web:0b867a5ad14d9110e4b388',
});

const messaging = firebase.messaging();

// Recognised by MessagingService, which turns it into the in-app snackbar. Its own copy of this
// string is in messaging.service.ts — a service worker can't import from the app bundle.
const PUSH_TO_WINDOW = 'planner-push';

// Title and body arrive under `data`, not `notification` — the sender deliberately omits the
// `notification` key so that neither the FCM SDK's own push handler nor ngsw-worker's (imported
// below) displays a second and third copy of the same message. See scripts/send-notifications.mjs.
messaging.onBackgroundMessage(async (payload) => {
  await self.registration.showNotification(payload.data?.title || 'Planner', {
    body: payload.data?.body,
    icon: 'icons/icon-192x192.png',
    data: payload.data,
  });

  // The FCM SDK only reaches this handler when it found no *visible* window client — when it
  // finds one it posts the payload to the page instead and shows nothing, which is what drives
  // the in-app snackbar. On iOS that detection doesn't work: an installed PWA sitting open in
  // the foreground is not reported as a visible client, so the push lands here and the driver
  // looking straight at the app got a lock-screen notification and nothing in the app itself.
  //
  // Forwarding the payload on regardless covers that. It is deliberately not a substitute for
  // the notification above — the service worker can't tell whether anyone is actually looking,
  // so it always notifies and lets the page decide: MessagingService only raises the snackbar if
  // the document really is visible, and ignores this otherwise rather than queueing a snackbar
  // that would surface much later when the app is next opened.
  //
  // Two routes, because on iOS neither is dependable alone. clients.matchAll() is the direct
  // one, but the same WebKit gap that hides the window from hasVisibleClients above can leave
  // this list empty too, in which case there is nobody to post to. BroadcastChannel doesn't
  // enumerate clients at all, so it survives that — at the cost of not existing in every
  // service-worker implementation, hence the feature check. When both work the page receives the
  // push twice and dedupes on `id`.
  const message = {
    type: PUSH_TO_WINDOW,
    // FCM's own per-message id where there is one; the text is a good enough fallback, since
    // the only thing this has to distinguish is one push from the next.
    id: payload.messageId ?? `${payload.data?.title ?? ''}|${payload.data?.body ?? ''}`,
    data: payload.data ?? {},
  };

  const clients = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
  for (const client of clients) {
    client.postMessage(message);
  }

  if (typeof BroadcastChannel === 'function') {
    const channel = new BroadcastChannel(PUSH_TO_WINDOW);
    channel.postMessage(message);
    channel.close();
  }

  // Deliberately left in: this path is invisible from the page when it fails (no error, just no
  // snackbar), and the client count is the one number that says which of the two routes above
  // had any chance of working. Readable on a phone via Safari's Web Inspector.
  console.log(`[push] forwarded to ${clients.length} client(s), BroadcastChannel: ${typeof BroadcastChannel === 'function'}`);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? '/'));
});

// Angular's service worker owns asset caching; load it last so it still controls fetch.
importScripts('./ngsw-worker.js');
