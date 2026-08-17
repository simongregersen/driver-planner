import {inject} from '@angular/core';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent, ConfirmDialogData} from './confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from './dialog-config';

/**
 * Stops Escape or a stray backdrop click from silently throwing away a half-filled form.
 *
 * The editor dialogs are opened with `disableClose: true` (see dialog-config.ts), which turns
 * both of those gestures into events this can intercept rather than an immediate teardown. An
 * untouched form still closes instantly — the guard has to be invisible in the common case, or
 * it just becomes an extra tap on every cancel. Only once something has actually been typed does
 * it route through the app's existing confirm dialog.
 *
 * Why this matters most on mobile: DIALOG_CONFIG's `maxWidth: 95vw` leaves a live backdrop strip
 * down each side of the dialog on a phone, so a thumb reaching for a field can dismiss a
 * completed Chaufførrapport — two timestamps, two odometer readings, four toggles and a note —
 * with no confirmation and no way to recover it.
 *
 * Call from a dialog component's constructor or ngOnInit, passing a predicate that reports
 * whether the user has entered anything worth keeping.
 */
export function guardDialogDismissal(dialogRef: MatDialogRef<unknown>, isDirty: () => boolean): void {
  const dialog = inject(MatDialog);

  const tryClose = () => {
    if (!isDirty()) {
      dialogRef.close();
      return;
    }
    dialog
      .open(ConfirmDialogComponent, {
        ...CONFIRM_DIALOG_CONFIG,
        data: {
          message: 'Kassér dine ændringer?',
          confirmLabel: 'Kassér',
          danger: true,
        } as ConfirmDialogData,
      })
      .afterClosed()
      .subscribe(discard => {
        if (discard) dialogRef.close();
      });
  };

  dialogRef.backdropClick().subscribe(tryClose);
  dialogRef.keydownEvents().subscribe(event => {
    if (event.key === 'Escape') {
      // The dialog is disableClose, so Escape reaches here instead of tearing the dialog down —
      // but it would still bubble on to anything else listening for it (an open overlay, the
      // browser's own full-screen handling), so stop it here now that it's been handled.
      event.preventDefault();
      event.stopPropagation();
      tryClose();
    }
  });
}
