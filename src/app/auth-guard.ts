import {Injectable} from '@angular/core';
import {ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot} from '@angular/router';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {authState} from 'rxfire/auth';
import {auth} from './firebase';

@Injectable()
export class AuthGuard implements CanActivate {

  constructor(private router: Router) {
  }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> | Promise<boolean> | boolean {
    return authState(auth).pipe(map(user => {
      if (user == null) {
        this.router.navigate(['/login']);
        return false;
      } else {
        return true;
      }
    }));
  }

}
