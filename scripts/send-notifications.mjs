// Reads /notificationQueue from the Realtime Database and sends each entry as an FCM
// push, using firebase-admin (server-side credential — never bundled into the app).
// Run from GitHub Actions (see .github/workflows/notification-poller.yml); the service
// account JSON and database URL come from environment variables so no secret is ever
// committed to the repo.
import {initializeApp, cert, deleteApp} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {getMessaging} from 'firebase-admin/messaging';

const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
const databaseURL = process.env.FIREBASE_DATABASE_URL;

if (!serviceAccountJson || !databaseURL) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS_JSON and FIREBASE_DATABASE_URL must be set');
  process.exit(1);
}

const app = initializeApp({
  credential: cert(JSON.parse(serviceAccountJson)),
  databaseURL,
});

const db = getDatabase();
const messaging = getMessaging();

// Returns `tokens` and `owners` as strictly parallel arrays: owners[i] is who tokens[i] belongs
// to. This used to key `owners` by the token itself and recover the owner positionally via
// [...owners.keys()][i], which silently assumed every token was unique across uids. An FCM token
// is scoped to the browser/service-worker registration rather than to a user, so two drivers
// signing in on one shared device produce the *same* token stored under two different uids — at
// which point the Map was shorter than the array, every index past the duplicate pointed at the
// wrong owner, and the tail of the list read as undefined and threw.
//
// A token appearing under several uids is deduped for sending (nobody wants the same push
// twice), but every owner of it is kept, so pruning a dead token cleans up all of its records.
async function collectTokens(uids) {
  const tokens = [];
  const owners = [];
  const indexByToken = new Map();
  for (const uid of uids) {
    const snapshot = await db.ref(`/fcmTokens/${uid}`).get();
    const deviceTokens = snapshot.val() || {};
    for (const [tokenHash, entry] of Object.entries(deviceTokens)) {
      if (!entry?.token) continue;
      const existing = indexByToken.get(entry.token);
      if (existing !== undefined) {
        owners[existing].push({uid, tokenHash});
        continue;
      }
      indexByToken.set(entry.token, tokens.length);
      tokens.push(entry.token);
      owners.push([{uid, tokenHash}]);
    }
  }
  return {tokens, owners};
}

async function pruneStaleTokens(owners, responses) {
  await Promise.all(responses.flatMap((response, i) => {
    if (response.success) return [];
    const code = response.error?.code;
    if (code !== 'messaging/registration-token-not-registered' && code !== 'messaging/invalid-registration-token') {
      return [];
    }
    return (owners[i] ?? []).map(owner => db.ref(`/fcmTokens/${owner.uid}/${owner.tokenHash}`).remove());
  }));
}

async function main() {
  const snapshot = await db.ref('/notificationQueue').get();
  const queue = snapshot.val() || {};
  const entries = Object.entries(queue);

  if (!entries.length) {
    console.log('No pending notifications.');
    return;
  }

  let failures = 0;
  for (const [pushId, entry] of entries) {
    // Each entry is isolated: one malformed or unsendable row must not block every row behind
    // it. Previously a throw anywhere in here escaped to main().catch and exited before the
    // queue entry was removed, so the 5-minute cron retried the same poisoned row forever and
    // no driver received any notification at all until someone cleared it by hand.
    try {
      const {tokens, owners} = await collectTokens(entry.uids || []);
      if (tokens.length) {
        // Data-only, deliberately. combined-sw.js ends up with three independent push handlers
        // in the one service worker — the FCM SDK's own, ngsw-worker's, and the app's
        // onBackgroundMessage — and a top-level `notification` payload makes all three display
        // it, so one trip change arrived on the phone as three identical notifications. Both of
        // the first two bail when there is no `notification` key, which leaves the app's own
        // handler as the single display, and it's the one whose icon and click behaviour the app
        // controls. FCM rejects a data payload whose values aren't all strings.
        const response = await messaging.sendEachForMulticast({
          tokens,
          data: {
            title: String(entry.title ?? ''),
            body: String(entry.body ?? ''),
            ...Object.fromEntries(Object.entries(entry.data || {}).map(([k, v]) => [k, String(v)])),
          },
        });
        await pruneStaleTokens(owners, response.responses);
        console.log(`Sent "${entry.title}" to ${response.successCount}/${tokens.length} device(s).`);
      } else {
        console.log(`No registered devices for notification "${entry.title}", skipping send.`);
      }
    } catch (err) {
      failures++;
      console.error(`Failed to send notification ${pushId} ("${entry.title}"):`, err);
    }
    // Removed regardless of outcome. A notification is only worth delivering close to when it
    // was raised, so a row that couldn't be sent is dropped rather than retried indefinitely —
    // and leaving it queued is what wedged the whole poller before.
    await db.ref(`/notificationQueue/${pushId}`).remove();
  }

  if (failures) {
    // Non-zero exit so a persistent problem still shows up as a red workflow run, now that
    // individual failures no longer stop the queue from draining.
    console.error(`${failures} of ${entries.length} notification(s) could not be sent.`);
    process.exitCode = 1;
  }
}

// The database client holds an open WebSocket to RTDB from the first read onwards, and an open
// socket keeps Node's event loop alive — so tearing the app down is what actually ends the
// process. Without it the script printed its output, finished its work, and then sat idle until
// Actions killed the job hours later, once per run of a five-minute cron.
//
// The failure path sets exitCode rather than calling process.exit() for the same reason: exiting
// there would skip this cleanup, and it's the one path most likely to have left the connection
// in a state worth closing properly.
main()
  .catch(err => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => deleteApp(app));
