import {MatDialogConfig} from '@angular/material/dialog';

/** Below 599px this panelClass makes the dialog fill the screen instead (see styles.css) —
 * a full-screen sheet reads as a native app modal, where a centered box reads as a desktop
 * popup. Shared by DIALOG_CONFIG and SMALL_DIALOG_CONFIG below, not by CONFIRM_DIALOG_CONFIG:
 * short yes/no confirmations stay centered even on mobile, since blowing a two-button prompt
 * up to full screen looks empty and feels heavier than the action warrants. */
const FULLSCREEN_ON_MOBILE = 'app-dialog-fullscreen-mobile';

/** Shared size for the app's editor dialogs, matching the previous "large" modal width. */
export const DIALOG_CONFIG: MatDialogConfig = {
  width: '800px',
  maxWidth: '95vw',
  panelClass: FULLSCREEN_ON_MOBILE,
};

/** Narrower dialogs, for short single-purpose forms. */
export const SMALL_DIALOG_CONFIG: MatDialogConfig = {
  width: '500px',
  maxWidth: '95vw',
  panelClass: FULLSCREEN_ON_MOBILE,
};

/** For ConfirmDialogComponent's yes/no prompts — see FULLSCREEN_ON_MOBILE above for why
 * these deliberately don't get the same mobile treatment as the other two configs. */
export const CONFIRM_DIALOG_CONFIG: MatDialogConfig = {
  width: '500px',
  maxWidth: '95vw',
};
