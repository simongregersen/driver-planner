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
  connectAuthEmulator(auth, `http://${emulatorHost}:9099`);
  connectDatabaseEmulator(db, emulatorHost, 9000);
}

// Messaging isn't available in every browser (e.g. no SW/Notification support), and
// isSupported() is itself async, so callers await this instead of a plain getMessaging().
export const messaging: Promise<Messaging | null> = isSupported()
  .then(supported => supported ? getMessaging(app) : null)
  .catch(() => null);
