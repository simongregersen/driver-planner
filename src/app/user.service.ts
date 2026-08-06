import {Injectable} from '@angular/core';
import {child, ref, update} from 'firebase/database';
import {objectVal} from 'rxfire/database';
import {deleteApp, initializeApp} from 'firebase/app';
import {connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut} from 'firebase/auth';
import {Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {db} from './firebase';
import {environment} from '../environments/environment';
import {AuthenticationService} from './authentication.service';
import {DataStore} from './data.service';
import {AppUser} from './user';
import {Driver} from './driver';

@Injectable({providedIn: 'root'})
export class UserService {
  private usersRef = ref(db, '/users');

  user$: Observable<AppUser | null>;
  role$: Observable<'admin' | 'driver' | null>;
  isAdmin$: Observable<boolean>;
  driverProfile$: Observable<Driver | null>;

  constructor(private authService: AuthenticationService, private dataStore: DataStore) {
    this.user$ = this.authService.authState.pipe(
      switchMap(u => u ? objectVal<AppUser>(child(this.usersRef, u.uid)) : of(null))
    );
    this.role$ = this.user$.pipe(map(u => u?.role ?? null));
    this.isAdmin$ = this.role$.pipe(map(r => r === 'admin'));
    this.driverProfile$ = this.user$.pipe(
      switchMap(u => (u?.role === 'driver' && u.driverId) ? this.dataStore.getDriver(u.driverId) : of(null))
    );
  }

  createDriverLogin(email: string, password: string, driverId: string): Promise<void> {
    const secondaryApp = initializeApp(environment.firebase, `secondary-${email}`);
    const secondaryAuth = getAuth(secondaryApp);
    if (environment.useEmulators) {
      connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099');
    }

    return createUserWithEmailAndPassword(secondaryAuth, email, password)
      .then(cred => signOut(secondaryAuth).then(() => update(ref(db), {
        [`/users/${cred.user.uid}`]: {role: 'driver', driverId},
        [`/drivers/${driverId}/uid`]: cred.user.uid,
        [`/drivers/${driverId}/email`]: email
      })))
      .finally(() => deleteApp(secondaryApp));
  }
}
