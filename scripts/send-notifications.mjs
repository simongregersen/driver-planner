// Reads /notificationQueue from the Realtime Database and sends each entry as an FCM
// push, using firebase-admin (server-side credential — never bundled into the app).
// Run from GitHub Actions (see .github/workflows/notification-poller.yml); the service
// account JSON and database URL come from environment variables so no secret is ever
// committed to the repo.
import {initializeApp, cert} from 'firebase-admin/app';
import {getDatabase} from 'firebase-admin/database';
import {getMessaging} from 'firebase-admin/messaging';

const serviceAccountJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
const databaseURL = process.env.FIREBASE_DATABASE_URL;

if (!serviceAccountJson || !databaseURL) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS_JSON and FIREBASE_DATABASE_URL must be set');
  process.exit(1);
}

initializeApp({
  credential: cert(JSON.parse(serviceAccountJson)),
  databaseURL,
});

const db = getDatabase();
const messaging = getMessaging();

async function collectTokens(uids) {
  const tokens = [];
  const owners = new Map();
  for (const uid of uids) {
    const snapshot = await db.ref(`/fcmTokens/${uid}`).get();
    const deviceTokens = snapshot.val() || {};
    for (const [tokenHash, entry] of Object.entries(deviceTokens)) {
      tokens.push(entry.token);
      owners.set(entry.token, {uid, tokenHash});
    }
  }
  return {tokens, owners};
}

async function pruneStaleTokens(owners, responses) {
  await Promise.all(responses.map((response, i) => {
    if (response.success) return Promise.resolve();
    const code = response.error?.code;
    if (code !== 'messaging/registration-token-not-registered' && code !== 'messaging/invalid-registration-token') {
      return Promise.resolve();
    }
    const token = [...owners.keys()][i];
    const owner = owners.get(token);
    return db.ref(`/fcmTokens/${owner.uid}/${owner.tokenHash}`).remove();
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

  for (const [pushId, entry] of entries) {
    const {tokens, owners} = await collectTokens(entry.uids || []);
    if (tokens.length) {
      const response = await messaging.sendEachForMulticast({
        tokens,
        notification: {title: entry.title, body: entry.body},
        data: entry.data || {},
      });
      await pruneStaleTokens(owners, response.responses);
      console.log(`Sent "${entry.title}" to ${response.successCount}/${tokens.length} device(s).`);
    } else {
      console.log(`No registered devices for notification "${entry.title}", skipping send.`);
    }
    await db.ref(`/notificationQueue/${pushId}`).remove();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
