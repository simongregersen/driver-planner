import {Injectable, inject} from '@angular/core';
import {MatSnackBar, MatSnackBarRef, TextOnlySnackBar} from '@angular/material/snack-bar';

// Firebase Realtime Database's web SDK has no offline-persistence feature at all (unlike
// Firestore's web SDK, or either platform's native mobile SDKs) — there's no way to make trip/
// vehicle data available while offline short of a full custom IndexedDB caching layer. This
// can't fix that; it only makes the offline state visible, so a driver in a dead zone
// understands why the app looks stuck rather than assuming something's broken.
@Injectable({providedIn: 'root'})
export class OnlineStatusService {
  private readonly snackBar = inject(MatSnackBar);
  private snackBarRef: MatSnackBarRef<TextOnlySnackBar> | null = null;

  constructor() {
    if (!navigator.onLine) this.showOfflineNotice();
    window.addEventListener('online', () => this.dismissOfflineNotice());
    window.addEventListener('offline', () => this.showOfflineNotice());
  }

  // No `duration` — stays open until dismissOfflineNotice() explicitly closes it, since "offline"
  // is an ongoing state to keep showing, not a one-off event to flash and forget.
  private showOfflineNotice(): void {
    if (this.snackBarRef) return;
    this.snackBarRef = this.snackBar.open('Ingen internetforbindelse — ændringer gemmes, når forbindelsen er tilbage.');
  }

  private dismissOfflineNotice(): void {
    this.snackBarRef?.dismiss();
    this.snackBarRef = null;
  }
}
