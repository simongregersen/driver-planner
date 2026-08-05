import {initializeApp} from 'firebase/app';
import {connectDatabaseEmulator, getDatabase} from 'firebase/database';
import {connectAuthEmulator, getAuth} from 'firebase/auth';
import {environment} from '../environments/environment';

const app = initializeApp(environment.firebase);

export const db = getDatabase(app);
export const auth = getAuth(app);

if (environment.useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}
