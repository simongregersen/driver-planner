import {MatDialogConfig} from '@angular/material/dialog';

/** Shared size for the app's editor dialogs, matching the previous "large" modal width. Same
 * look on mobile and desktop — deliberately no fullscreen-on-mobile treatment. */
export const DIALOG_CONFIG: MatDialogConfig = {
  width: '800px',
  maxWidth: '95vw',
};

/** Narrower dialogs, for short single-purpose forms. */
export const SMALL_DIALOG_CONFIG: MatDialogConfig = {
  width: '500px',
  maxWidth: '95vw',
};

/** For ConfirmDialogComponent's yes/no prompts. */
export const CONFIRM_DIALOG_CONFIG: MatDialogConfig = {
  width: '500px',
  maxWidth: '95vw',
};
