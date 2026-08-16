/**
 * Background-scroll-blocking for mobile dialogs/sheets, standing in for CDK's own
 * BlockScrollStrategy. CDK's version blocks the page by toggling <html> to position: fixed (its
 * cdk-global-scrollblock class) — on iOS Safari in standalone PWA mode, that specific mutation
 * is what makes the viewport-height calculation behind the bottom nav's safe-area handling
 * briefly go stale (see app.config.ts). This blocks the same background scroll a different way:
 * intercepting touchmove directly and only letting it through when it actually starts inside a
 * scrollable element that belongs to the open overlay. Tried first with touch-action CSS
 * (none on the backdrop/surface, pan-y on the dialog's own scrollable content) — that stopped a
 * drag on the backdrop, but not one on a form field inside the dialog, since a form field itself
 * isn't scrollable and the browser chained the gesture past the surrounding non-scrollable
 * chrome (title bar etc.) to the page behind, seemingly ignoring the ancestor chain's touch-
 * action: none along the way. A direct per-touch decision in JS isn't exposed to that ambiguity.
 */

import {findScrollableAncestor} from './touch-scroll';

let openCount = 0;

// Stops at the shared overlay root, so a touch on non-scrollable overlay chrome (backdrop,
// dialog title/actions, a short form that doesn't overflow) never falls through to the page,
// while one starting inside a genuinely-overflowing region still scrolls it normally.
function onTouchMove(event: TouchEvent): void {
  const scrollable = findScrollableAncestor(event.target, el => el.classList.contains('cdk-overlay-container'));
  if (!scrollable) {
    event.preventDefault();
  }
}

export class MobileScrollBlockStrategy {
  private isEnabled = false;

  // Required by CDK's ScrollStrategy interface, but this strategy has nothing to do until
  // enable() actually runs — all of it happens there (and disable()) instead.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  attach(): void {}

  enable(): void {
    if (this.isEnabled) {
      return;
    }
    this.isEnabled = true;
    openCount++;
    if (openCount === 1) {
      document.addEventListener('touchmove', onTouchMove, {passive: false});
    }
  }

  disable(): void {
    if (!this.isEnabled) {
      return;
    }
    this.isEnabled = false;
    openCount = Math.max(0, openCount - 1);
    if (openCount === 0) {
      document.removeEventListener('touchmove', onTouchMove);
    }
  }
}
