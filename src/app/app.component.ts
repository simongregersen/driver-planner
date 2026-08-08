import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatButtonModule} from '@angular/material/button';
import {MatDividerModule} from '@angular/material/divider';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {AuthenticationService} from './authentication.service';
import {UserService} from './user.service';
import {MessagingService} from './messaging.service';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [
    AsyncPipe, RouterLink, RouterLinkActive, RouterOutlet,
    MatToolbarModule, MatButtonModule, MatDividerModule, MatIconModule, MatMenuModule, MatTabsModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly authService = inject(AuthenticationService);
  private readonly userService = inject(UserService);
  private readonly messagingService = inject(MessagingService);
  private readonly snackBar = inject(MatSnackBar);

  loggedIn$: Observable<boolean> = this.authService.authState.pipe(map(user => user != null));
  isAdmin$: Observable<boolean> = this.userService.isAdmin$;
  isDriver$: Observable<boolean> = this.userService.driverProfile$.pipe(map(driver => driver != null));
  email$: Observable<string | null> = this.authService.authState.pipe(map(user => user?.email ?? null));

  async logout() {
    await this.messagingService.unregister();
    this.authService.logout();
  }

  print() {
    window.print();
  }

  async enableNotifications() {
    const enabled = await this.messagingService.register();
    this.snackBar.open(
      enabled ? 'Notifikationer er slået til.' : 'Kunne ikke slå notifikationer til.',
      'OK',
      {duration: 4000},
    );
  }

}
