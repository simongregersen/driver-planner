import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {map} from 'rxjs/operators';
import {UserService} from './user.service';

export const adminGuard: CanActivateFn = () => {
  const userService = inject(UserService);
  const router = inject(Router);
  return userService.isAdmin$.pipe(map(isAdmin => {
    if (!isAdmin) {
      router.navigate(['/my-trips']);
      return false;
    } else {
      return true;
    }
  }));
};
