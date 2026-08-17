import {Injectable, inject} from '@angular/core';
import {child, ref, update} from 'firebase/database';
import {objectVal} from 'rxfire/database';
import {deleteApp, initializeApp} from 'firebase/app';
import {connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut} from 'firebase/auth';
import {Observable, of} from 'rxjs';
import {filter, map, shareReplay, startWith, switchMap} from 'rxjs/operators';
import {db} from './firebase';
import {environment} from '../environments/environment';
import {AuthenticationService} from './authentication.service';
import {DataStore} from './data.service';
import {AppUser} from './user';
import {Driver} from './driver';

@Injectable({providedIn: 'root'})
export class UserService {
  private readonly authService = inject(AuthenticationService);
  private readonly dataStore = inject(DataStore);
  private usersRef = ref(db, '/users');

  // `undefined` means this user's /users record has not been read yet; `null` means it has been
  // and there is nothing there (signed out, or a login with no /users entry). Keeping those two
  // apart is what lets roleResolved$ below wait instead of guessing — see its comment.
  user$: Observable<AppUser | null | undefined>;
  role$: Observable<'admin' | 'driver' | null>;
  isAdmin$: Observable<boolean>;
  roleResolved$: Observable<'admin' | 'driver' | null>;
  driverProfile$: Observable<Driver | null>;

  constructor() {
    this.user$ = this.authService.authState.pipe(
      // startWith(undefined) drops the previous auth state's value the instant auth changes.
      // Without it, the shareReplay below keeps handing that stale value to every subscriber
      // arriving while the new user's read is still in flight — and right after sign-in the
      // stale value is the signed-out `null`, which reads as "not an admin".
      switchMap(u => u ? objectVal<AppUser>(child(this.usersRef, u.uid)).pipe(startWith(undefined)) : of(null)),
      // The app shell alone subscribes to the observables below seven times (isAdmin$ ×3,
      // isDriver$ ×2, driverName$, loggedIn$), and routed components add more — without this,
      // every one of them rebuilds this switchMap chain independently and re-runs it on every
      // authState emission. RTDB's own SyncTree dedupes the resulting identical listeners, so
      // what this actually saves is client-side pipeline and change-detection churn rather than
      // bandwidth; it's cheap, and it makes this service consistent with DataStore's
      // getAllDrivers/getAllVehicles.
      shareReplay({bufferSize: 1, refCount: true}),
    );
    this.role$ = this.user$.pipe(map(u => u?.role ?? null));
    this.isAdmin$ = this.role$.pipe(map(r => r === 'admin'));
    // role$ collapses "not read yet" and "no role" into the same `null`, which is fine for the
    // nav (an admin tab that appears a moment late costs nothing) but wrong for anything that
    // has to make an irreversible decision on it: adminGuard used to read the not-yet-read state
    // as "not an admin" and bounce an admin off the page they'd just been sent to. This waits for
    // the record to actually have been read, and — unlike filtering role$ for non-null — still
    // emits (as `null`) for a login with no /users entry, so such a user gets turned away rather
    // than left hanging on a navigation that never resolves.
    this.roleResolved$ = this.user$.pipe(
      filter((u): u is AppUser | null => u !== undefined),
      map(u => u?.role ?? null),
    );
    this.driverProfile$ = this.user$.pipe(
      // Same reasoning: while the record is being read there is no answer yet, and emitting a
      // provisional `null` would flash the app into its "not a driver" shape (empty Min dag, no
      // name chip) and let the root redirect resolve off it.
      filter((u): u is AppUser | null => u !== undefined),
      switchMap(u => u?.driverId ? this.dataStore.getDriver(u.driverId) : of(null))
    );
  }

  createDriverLogin(email: string, password: string, driverId: string): Promise<void> {
    const secondaryApp = initializeApp(environment.firebase, `secondary-${email}`);
    const secondaryAuth = getAuth(secondaryApp);
    if (environment.useEmulators) {
      connectAuthEmulator(secondaryAuth, `http://${window.location.hostname}:9099`);
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
