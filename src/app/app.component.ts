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
import {NavMoreSheetComponent, NavMoreSheetData} from './nav-more-sheet/nav-more-sheet.component';
import {BrandIconComponent} from './brand-icon/brand-icon.component';

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
