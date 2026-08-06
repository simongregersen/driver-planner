import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {NgbTooltip} from '@ng-bootstrap/ng-bootstrap';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {AuthenticationService} from './authentication.service';
import {UserService} from './user.service';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [AsyncPipe, RouterLink, RouterLinkActive, RouterOutlet, NgbTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly authService = inject(AuthenticationService);
  private readonly userService = inject(UserService);

  loggedIn$: Observable<boolean> = this.authService.authState.pipe(map(user => user != null));
  isAdmin$: Observable<boolean> = this.userService.isAdmin$;
  isDriver$: Observable<boolean> = this.userService.driverProfile$.pipe(map(driver => driver != null));
  email$: Observable<string | null> = this.authService.authState.pipe(map(user => user?.email ?? null));

  logout() {
    this.authService.logout();
  }

  print() {
    window.print();
  }

}
