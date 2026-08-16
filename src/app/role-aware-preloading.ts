import {Injectable, inject} from '@angular/core';
import {PreloadingStrategy, Route} from '@angular/router';
import {EMPTY, Observable} from 'rxjs';
import {filter, switchMap, take} from 'rxjs/operators';
import {UserService} from './user.service';

/**
 * PreloadAllModules, minus the pages this user can never open.
 *
 * The reason for preloading at all is unchanged: every route is lazy, so without it the first
 * click on a nav link has to fetch and parse that chunk before anything mounts. But the built-in
 * strategy is all-or-nothing, and this app's routes are split sharply by role — the admin pages
 * (Dagsplaner, Periodeplaner, Skabeloner, Chauffører, Køretøjer, Overblik, Ruter, Oprydning) are
 * the bulk of the lazy JS, and adminGuard means a driver can never reach any of them. Drivers are
 * both the majority of users here and the ones most likely to be on a metered mobile connection,
 * so sending them the whole admin app on every visit is pure waste.
 *
 * Routes opt in by marking themselves `data: {adminOnly: true}` — the strategy is handed the raw
 * Route config rather than an ActivatedRouteSnapshot, so `data` is not inherited from the parent
 * and each leaf has to carry the flag itself (see app.routes.ts).
 */
@Injectable({providedIn: 'root'})
export class RoleAwarePreloadingStrategy implements PreloadingStrategy {
  private readonly userService = inject(UserService);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!route.data?.['adminOnly']) return load();

    // Wait for the role to actually be known rather than sampling it immediately: preloading
    // runs on NavigationEnd, which can win the race against the /users/$uid read that resolves
    // the role, and treating a not-yet-loaded role as "not an admin" would skip preloading for
    // the very users these chunks are for. A signed-out session simply never emits a role and
    // so never preloads them, which is the correct outcome anyway.
    return this.userService.role$.pipe(
      filter((role): role is 'admin' | 'driver' => role !== null),
      take(1),
      switchMap(role => (role === 'admin' ? load() : EMPTY)),
    );
  }
}
