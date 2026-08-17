import {Injectable, WritableSignal, inject} from '@angular/core';
import {MatDialogRef} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';

/**
 * What actually became of a write.
 *
 * `pending` is the one that doesn't exist in an ordinary promise-shaped API, and it's the whole
 * reason this service exists — see `run()`.
 */
export type WriteOutcome = 'saved' | 'pending' | 'failed';

export interface WriteFeedbackOptions {
  /** Shown when the write is rejected outright. */
  failureMessage?: string;
  /** Shown when the write hasn't been acknowledged before the deadline below. */
  pendingMessage?: string;
}

// How long to wait for the server to acknowledge a write before telling the user it's queued
// rather than done. Long enough not to fire on an ordinary slow-but-working connection, short
// enough that a driver in a dead zone isn't left staring at a frozen dialog.
const ACK_TIMEOUT_MS = 3000;

const DEFAULT_FAILURE = 'Kunne ikke gemme. Prøv igen.';
const DEFAULT_PENDING = 'Ingen forbindelse — turen sendes, når du er online igen. Hold appen åben.';

/**
 * Wraps a Realtime Database write so all three of its outcomes are visible to the user.
 *
 * The problem this solves: an RTDB write issued while offline neither resolves nor rejects. The
 * SDK buffers it in memory and only settles the promise once the server acknowledges it. So the
 * usual `write.then(close, showError)` shape has a third case it silently never handles — the
 * dialog simply never closes, no error is ever shown, and the submit button stays enabled. That
 * is precisely the case this app exists for (a driver in a dead zone filing a report), so it
 * can't be left as the unhandled one.
 *
 * `run()` therefore races the write against a deadline and reports `pending` if it hasn't been
 * acknowledged by then, letting the caller close its dialog and tell the truth: the write is
 * queued, not saved. If the write later rejects, the failure snackbar still fires — the caller
 * has already moved on by then, so this is the only place it would otherwise be reported.
 *
 * The wording deliberately does NOT promise the write survives closing the app, because it
 * doesn't: RTDB's web SDK has no offline persistence, so the buffer is memory-only (see
 * OnlineStatusService's header comment for the same caveat).
 */
@Injectable({providedIn: 'root'})
export class WriteFeedbackService {
  private readonly snackBar = inject(MatSnackBar);

  run(write: PromiseLike<unknown>, options: WriteFeedbackOptions = {}): Promise<WriteOutcome> {
    const failureMessage = options.failureMessage ?? DEFAULT_FAILURE;
    const pendingMessage = options.pendingMessage ?? DEFAULT_PENDING;
    let acknowledged = false;

    const settled: Promise<WriteOutcome> = Promise.resolve(write).then(
      () => {
        acknowledged = true;
        return 'saved' as const;
      },
      (err: unknown) => {
        acknowledged = true;
        // Reported here rather than left to the global ErrorHandler: by the time a write that
        // already reported `pending` finally rejects, its dialog is long gone, so this snackbar
        // is the only signal the user will ever get.
        console.error('[WriteFeedbackService] write failed', err);
        this.snackBar.open(failureMessage, 'OK', {duration: 6000});
        return 'failed' as const;
      },
    );

    const deadline = new Promise<WriteOutcome>(resolve => {
      setTimeout(() => {
        if (acknowledged) return;
        this.snackBar.open(pendingMessage, 'OK', {duration: 8000});
        resolve('pending');
      }, ACK_TIMEOUT_MS);
    });

    return Promise.race([settled, deadline]);
  }

  /**
   * The dialog-shaped case of `run()`, which is nearly every write in this app.
   *
   * Holds `saving` for as long as the write is in flight — that's what stops an impatient second
   * tap on a slow connection from creating a duplicate record — then closes the dialog on
   * success *or* on a merely-unacknowledged write, and deliberately leaves it open on outright
   * failure so whatever the user typed isn't discarded along with it.
   */
  closeDialogOn(
    dialogRef: MatDialogRef<unknown>,
    write: PromiseLike<unknown>,
    saving?: WritableSignal<boolean>,
    options?: WriteFeedbackOptions,
  ): Promise<WriteOutcome> {
    saving?.set(true);
    return this.run(write, options).then(outcome => {
      saving?.set(false);
      if (outcome !== 'failed') dialogRef.close();
      return outcome;
    });
  }
}
