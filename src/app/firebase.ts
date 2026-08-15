import {initializeApp} from 'firebase/app';
import {connectDatabaseEmulator, getDatabase} from 'firebase/database';
import {connectAuthEmulator, getAuth} from 'firebase/auth';
import {isSupported, getMessaging, Messaging} from 'firebase/messaging';
import {environment} from '../environments/environment';

const app = initializeApp(environment.firebase);

export const db = getDatabase(app);
export const auth = getAuth(app);

if (environment.useEmulators) {
  const emulatorHost = window.location.hostname;
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`, {disableWarnings: true});
  connectDatabaseEmulator(db, emulatorHost, 9000);
}

// Messaging isn't available in every browser (e.g. no SW/Notification support), and
// isSupported() is itself async, so callers await this instead of a plain getMessaging().
// isSupported()'s own indexedDB probe assumes a real browser context; skip it entirely when
// indexedDB isn't even defined (Node/jsdom test environments) rather than letting it reach for
// `self.indexedDB.open(...)` and throw — the .catch(() => null) below already exists for exactly
// this "messaging isn't available here" case, this just avoids exercising a problematic Firebase
// SDK path to get there.
export const messaging: Promise<Messaging | null> = (typeof indexedDB === 'undefined' ? Promise.resolve(false) : isSupported())
  .then(supported => supported ? getMessaging(app) : null)
  .catch(() => null);
