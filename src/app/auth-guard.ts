import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {map} from 'rxjs/operators';
import {authState} from 'rxfire/auth';
import {auth} from './firebase';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  return authState(auth).pipe(map(user => {
    if (user == null) {
      router.navigate(['/login']);
      return false;
    } else {
      return true;
    }
  }));
};
