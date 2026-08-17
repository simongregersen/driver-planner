import {inject} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';
import {map, take} from 'rxjs/operators';
import {UserService} from './user.service';

export const adminGuard: CanActivateFn = () => {
  const userService = inject(UserService);
  const router = inject(Router);
  // roleResolved$ rather than isAdmin$: isAdmin$ reports `false` for a role that simply hasn't
  // been read from /users/$uid yet, and that's exactly the state right after sign-in — the read
  // is still in flight when the root redirect sends an admin here, so this guard used to turn
  // them straight back to /my-trips. It only looked right on later launches, where the session
  // is restored before the first navigation and the role is already known by the time we run.
  return userService.roleResolved$.pipe(
    take(1),
    // Returning a UrlTree rather than navigating and returning false: the router then treats
    // /my-trips as the destination of this same navigation, instead of cancelling this one and
    // racing a second one against it.
    map(role => role === 'admin' ? true : router.createUrlTree(['/my-trips'])),
  );
};
