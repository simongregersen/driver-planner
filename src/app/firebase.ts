import {initializeApp} from 'firebase/app';
import {getDatabase} from 'firebase/database';
import {getAuth} from 'firebase/auth';
import {environment} from '../environments/environment';

const app = initializeApp(environment.firebase);

export const db = getDatabase(app);
export const auth = getAuth(app);
