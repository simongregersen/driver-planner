import {MatDialogConfig} from '@angular/material/dialog';

/** Shared size for the app's editor dialogs, matching the previous "large" modal width.
 *
 * disableClose does NOT mean these can't be dismissed — it means Escape and a backdrop click are
 * delivered as events instead of tearing the dialog down immediately, so guardDialogDismissal()
 * can ask before discarding typed-in input. Each editor dialog wires that up itself; a dialog
 * that doesn't would become genuinely un-dismissable by those gestures, so the two must stay
 * together. */
export const DIALOG_CONFIG: MatDialogConfig = {
  width: '800px',
  maxWidth: '95vw',
  disableClose: true,
};

/** Narrower dialogs, for short single-purpose forms. Same disableClose rationale as above. */
export const SMALL_DIALOG_CONFIG: MatDialogConfig = {
  width: '500px',
  maxWidth: '95vw',
  disableClose: true,
};

/** For ConfirmDialogComponent's yes/no prompts (including delete confirmations). */
export const CONFIRM_DIALOG_CONFIG: MatDialogConfig = {
  width: '500px',
  maxWidth: '95vw',
};

/** For TimePickerDialogComponent — no explicit width, so it sizes to its own compact content
 * (two wheels) rather than the app's usual editor-dialog width. panelClass lets styles.css give
 * it the touchUi datepicker's grey surface color, which a MatDialog can't reach by itself (its
 * surface is CDK-rendered outside this component's own template). */
export const TIME_PICKER_DIALOG_CONFIG: MatDialogConfig = {
  maxWidth: '95vw',
  panelClass: 'time-picker-dialog-panel',
};
