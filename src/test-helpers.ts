/**
 * Lets every already-queued promise callback run before the caller asserts.
 *
 * Writes now flow through WriteFeedbackService, which adds a couple of promise hops between
 * "the write resolved" and "the dialog closed" (see its `run`/`closeDialogOn`). A single
 * `await Promise.resolve()` only drains one of those hops, so specs asserting on the dialog
 * having closed need to drain the whole microtask queue instead. setTimeout(0) is a macrotask,
 * so it's scheduled strictly after everything already pending.
 */
export function flushWrites(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
