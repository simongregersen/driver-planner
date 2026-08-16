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
    // Deliberately does NOT promise that changes are saved and will sync later. RTDB's web SDK
    // buffers pending writes in memory only (outstandingPuts_ — there's no persistence layer to
    // fall back on, see this class's header comment), so a reload, or iOS evicting a
    // backgrounded PWA, discards them silently. Telling a driver their clock-out is safe and
    // then losing it surfaces two weeks later as a payroll discrepancy, which is far worse than
    // asking them to keep the app open.
    this.snackBarRef = this.snackBar.open('Ingen internetforbindelse. Hold appen åben, indtil forbindelsen er tilbage.', 'OK');
  }

  private dismissOfflineNotice(): void {
    this.snackBarRef?.dismiss();
    this.snackBarRef = null;
  }
}
