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

let openCount = 0;

function isScrollable(element: Element): boolean {
  const style = getComputedStyle(element);
  return (style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight;
}

// Walks up from the touch's start target looking for a scrollable element — stopping (and
// disallowing) if it reaches the shared overlay root first, so a touch on non-scrollable overlay
// chrome (backdrop, dialog title/actions, a short form that doesn't overflow) never falls through
// to scroll the page behind, while a touch that starts inside a genuinely-overflowing region
// (e.g. a tall form) still scrolls that region normally.
function findScrollableAncestorWithinOverlay(target: EventTarget | null): Element | null {
  let element = target instanceof Element ? target : null;
  while (element && element !== document.body) {
    if (element.classList.contains('cdk-overlay-container')) {
      return null;
    }
    if (isScrollable(element)) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

function onTouchMove(event: TouchEvent): void {
  if (!findScrollableAncestorWithinOverlay(event.target)) {
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
