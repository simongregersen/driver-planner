import {ErrorHandler, Injectable, Injector, inject} from '@angular/core';
import {MatSnackBar} from '@angular/material/snack-bar';

// Errors often arrive in bursts (one broken binding re-throwing on every change-detection pass).
// Showing a snackbar per occurrence would bury the app under them, so collapse repeats within
// this window into a single notice.
const NOTICE_THROTTLE_MS = 10000;

/**
 * Reports otherwise-invisible failures to the person actually holding the phone.
 *
 * Installed as the app's ErrorHandler alongside provideBrowserGlobalErrorListeners(), which is
 * what routes unhandled promise rejections here — the app has several fire-and-forget writes
 * whose rejections previously went nowhere at all. On a PWA installed on a driver's phone there
 * is no console anyone will ever read, so an error that isn't surfaced in the UI is an error
 * nobody will ever learn about; the app just quietly stops doing what was asked.
 *
 * This deliberately shows one generic message rather than the error text: the underlying errors
 * are Firebase/Angular internals in English, and a driver can act on "something went wrong, try
 * again" but not on a stack trace. The details still go to the console for anyone debugging.
 */
@Injectable()
export class AppErrorHandler implements ErrorHandler {
  // Resolved lazily rather than injected as a field: ErrorHandler is constructed very early in
  // the injector's lifetime, and taking a hard dependency on MatSnackBar here risks a cyclic
  // resolution during bootstrap. By the time an error can actually be reported, the injector is
  // fully built.
  private readonly injector = inject(Injector);
  private lastNoticeAt = 0;

  handleError(error: unknown): void {
    console.error(error);
    this.showNotice();
  }

  private showNotice(): void {
    const now = Date.now();
    if (now - this.lastNoticeAt < NOTICE_THROTTLE_MS) return;
    this.lastNoticeAt = now;
    try {
      this.injector.get(MatSnackBar).open('Der skete en uventet fejl.', 'OK', {duration: 6000});
    } catch {
      // Never let the error reporter throw its own error — that turns one visible failure into
      // an unbreakable loop. The console.error above has already recorded the original.
    }
  }
}
