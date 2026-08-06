import {Injectable} from '@angular/core';
import {CanActivate, Router} from '@angular/router';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {UserService} from './user.service';

@Injectable()
export class AdminGuard implements CanActivate {

  constructor(private userService: UserService, private router: Router) {
  }

  canActivate(): Observable<boolean> {
    return this.userService.isAdmin$.pipe(map(isAdmin => {
      if (!isAdmin) {
        this.router.navigate(['/my-trips']);
        return false;
      } else {
        return true;
      }
    }));
  }

}
