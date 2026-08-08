import {initializeApp} from 'firebase/app';
import {connectDatabaseEmulator, getDatabase} from 'firebase/database';
import {connectAuthEmulator, getAuth} from 'firebase/auth';
import {isSupported, getMessaging, Messaging} from 'firebase/messaging';
import {environment} from '../environments/environment';

const app = initializeApp(environment.firebase);

export const db = getDatabase(app);
export const auth = getAuth(app);

if (environment.useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}

// Messaging isn't available in every browser (e.g. no SW/Notification support), and
// isSupported() is itself async, so callers await this instead of a plain getMessaging().
export const messaging: Promise<Messaging | null> = isSupported()
  .then(supported => supported ? getMessaging(app) : null)
  .catch(() => null);
