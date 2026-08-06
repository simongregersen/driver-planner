import {Injectable} from '@angular/core';
import {signInWithEmailAndPassword, signOut, User} from 'firebase/auth';
import {authState} from 'rxfire/auth';
import {Router} from '@angular/router';
import {Observable} from 'rxjs';
import {auth} from './firebase';

@Injectable({providedIn: 'root'})
export class AuthenticationService {
  authState: Observable<User | null> = authState(auth);

  constructor(private router: Router) {
  }

  login(email: string, password: string) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  logout() {
    signOut(auth)
      .then(() => this.router.navigate(['/login']))
      .catch(err => console.log(err));
  }

}
