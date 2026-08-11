import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {RouterLink, RouterLinkActive} from '@angular/router';
import {MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA} from '@angular/material/bottom-sheet';
import {MatDividerModule} from '@angular/material/divider';
import {MatIconModule} from '@angular/material/icon';
import {MatListModule} from '@angular/material/list';
import {Observable} from 'rxjs';

// Everything that doesn't fit as a direct bottom-nav tab: the less-frequently-used admin
// links, plus the notifications/print/log-out actions that used to live in the desktop
// toolbar's overflow and the old hamburger menu.
export interface NavMoreSheetData {
  isAdmin$: Observable<boolean>;
  email$: Observable<string | null>;
  onEnableNotifications: () => void;
  onPrint: () => void;
  onLogout: () => void;
}

@Component({
  standalone: true,
  selector: 'app-nav-more-sheet',
  templateUrl: './nav-more-sheet.component.html',
  styleUrls: ['./nav-more-sheet.component.css'],
  imports: [AsyncPipe, RouterLink, RouterLinkActive, MatDividerModule, MatIconModule, MatListModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavMoreSheetComponent {
  readonly data = inject<NavMoreSheetData>(MAT_BOTTOM_SHEET_DATA);
  private readonly sheetRef = inject(MatBottomSheetRef<NavMoreSheetComponent>);

  close(): void {
    this.sheetRef.dismiss();
  }

  enableNotifications(): void {
    this.data.onEnableNotifications();
    this.close();
  }

  print(): void {
    this.data.onPrint();
    this.close();
  }

  logout(): void {
    this.data.onLogout();
    this.close();
  }
}
