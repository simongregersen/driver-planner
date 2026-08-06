import {Component} from '@angular/core';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {AuthenticationService} from './authentication.service';
import {UserService} from './user.service';

@Component({
  standalone: false,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent {
  loggedIn$: Observable<boolean>;
  isAdmin$: Observable<boolean>;

  constructor(private authService: AuthenticationService, private userService: UserService) {
    this.loggedIn$ = this.authService.authState.pipe(map(user => user != null));
    this.isAdmin$ = this.userService.isAdmin$;
  }

  logout() {
    this.authService.logout();
  }

  print() {
    window.print();
  }

}
