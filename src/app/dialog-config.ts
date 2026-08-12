import {MatDialogConfig} from '@angular/material/dialog';

/** Shared size for the app's editor dialogs, matching the previous "large" modal width. */
export const DIALOG_CONFIG: MatDialogConfig = {
  width: '800px',
  maxWidth: '95vw',
};

/** Narrower dialogs, for short single-purpose forms. */
export const SMALL_DIALOG_CONFIG: MatDialogConfig = {
  width: '500px',
  maxWidth: '95vw',
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
