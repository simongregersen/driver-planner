import {inject, Injectable} from '@angular/core';
import {signInWithEmailAndPassword, signOut, User} from 'firebase/auth';
import {authState} from 'rxfire/auth';
import {Router} from '@angular/router';
import {Observable} from 'rxjs';
import {auth} from './firebase';

@Injectable({providedIn: 'root'})
export class AuthenticationService {
  private readonly router = inject(Router);

  authState: Observable<User | null> = authState(auth);

  login(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  // Navigate away before signing out, not after — every routed component holding a live
  // Firebase listener (e.g. MyTripsComponent/DayPlansComponent's getDayPublic) needs to be torn
  // down (unsubscribed) before the auth token is revoked, otherwise the database re-evaluates
  // those still-attached listeners against the now-signed-out state and pushes a spurious
  // "permission_denied" console error before the navigation has a chance to detach them.
  logout() {
    this.router.navigate(['/login'])
      .then(() => signOut(auth))
      .catch(err => console.log(err));
  }

}
