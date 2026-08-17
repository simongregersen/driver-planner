import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatBottomSheet} from '@angular/material/bottom-sheet';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {AuthenticationService} from './authentication.service';
import {UserService} from './user.service';
import {MessagingService} from './messaging.service';
import {UpdateService} from './update.service';
import {OnlineStatusService} from './online-status.service';
import {NavMoreSheetComponent, NavMoreSheetData} from './nav-more-sheet/nav-more-sheet.component';
import {BrandIconComponent} from './brand-icon/brand-icon.component';
import {PageHeaderService} from './page-header.service';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [
    AsyncPipe, RouterLink, RouterLinkActive, RouterOutlet,
    MatToolbarModule, MatButtonModule, MatIconModule, MatTabsModule,
    MatTooltipModule, BrandIconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly authService = inject(AuthenticationService);
  private readonly userService = inject(UserService);
  private readonly messagingService = inject(MessagingService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly bottomSheet = inject(MatBottomSheet);
  // Field injection only — this activates UpdateService's constructor (its version-check
  // subscription), nothing here calls it directly.
  private readonly updateService = inject(UpdateService);
  // Same field-injection-only pattern — activates OnlineStatusService's online/offline listeners.
  private readonly onlineStatus = inject(OnlineStatusService);
  readonly pageHeader = inject(PageHeaderService);

  loggedIn$: Observable<boolean> = this.authService.authState.pipe(map(user => user != null));
  isAdmin$: Observable<boolean> = this.userService.isAdmin$;
  isDriver$: Observable<boolean> = this.userService.driverProfile$.pipe(map(driver => driver != null));
  email$: Observable<string | null> = this.authService.authState.pipe(map(user => user?.email ?? null));
  // For the mobile top bar's driver-name chip — the signed-in user's own driver profile, not
  // whichever driver an admin might currently be viewing elsewhere in the app.
  driverName$: Observable<string | null> = this.userService.driverProfile$.pipe(map(d => d?.displayName ?? null));

  // Token cleanup is best-effort and deliberately NOT awaited. unregister() ends in an RTDB
  // remove(), and an RTDB write while offline neither resolves nor rejects — it just sits in the
  // in-memory buffer until the server acks. Awaiting it meant that tapping "Log ud" in a dead
  // zone did nothing at all, with no feedback, leaving the driver signed in on what may well be
  // a shared device. Signing out must never be gated on a database write succeeding.
  logout() {
    void this.messagingService.unregister().catch(err => console.warn('Could not unregister the push token', err));
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

  openMoreSheet(): void {
    const data: NavMoreSheetData = {
      isAdmin$: this.isAdmin$,
      email$: this.email$,
      onEnableNotifications: () => this.enableNotifications(),
      onLogout: () => this.logout(),
    };
    this.bottomSheet.open(NavMoreSheetComponent, {data});
  }

}
