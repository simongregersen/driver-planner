import {Component} from '@angular/core';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {AuthenticationService} from './authentication.service';

@Component({
  standalone: false,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent {
  loggedIn$: Observable<boolean>;

  constructor(private authService: AuthenticationService) {
    this.loggedIn$ = this.authService.authState.pipe(map(user => user != null));
  }

  logout() {
    this.authService.logout();
  }

  print() {
    window.print();
  }

}
