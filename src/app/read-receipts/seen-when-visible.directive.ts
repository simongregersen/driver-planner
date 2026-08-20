import {DestroyRef, Directive, ElementRef, NgZone, effect, inject, input, output} from '@angular/core';

/** How long the element has to stay visible before it counts as seen. Long enough that scrolling
 *  past a row on the way somewhere else doesn't register, short enough that reading one does. */
export const SEEN_DWELL_MS = 1000;

/** How much of the element has to be genuinely on screen — inside the viewport *and* not covered
 *  by anything (see probeUnobstructedHeight). */
export const SEEN_MIN_RATIO = 0.5;

/** Escape hatch for an element taller than the viewport, which can never reach SEEN_MIN_RATIO —
 *  a long trip card on a small phone. Enough visible height to be genuinely readable. */
export const SEEN_MIN_HEIGHT_PX = 120;

/** Sample points used to measure how much of the element is actually uncovered. Rows resolve the
 *  vertical band a bottom bar eats into; the three columns stop a narrow overlay down the middle
 *  from reading as full occlusion, and vice versa. */
const PROBE_ROWS = 9;
const PROBE_COLUMNS = [0.25, 0.5, 0.75];

/**
 * Emits once when the host element has genuinely been on the user's screen.
 *
 * Deliberately knows nothing about trips, drivers or Firebase. It is a DOM primitive: callers hand
 * it an opaque token describing *what* would be seen, and get that token back when it has been.
 * That keeps the timing and visibility logic — the part that is hard to get right and easy to get
 * subtly wrong — testable on its own, with no database anywhere near it.
 *
 * The token is also the re-arm signal. Pass a new value and the element becomes unseen again,
 * which is what covers the case IntersectionObserver cannot report: the office editing a trip
 * while its row is already sitting on the driver's screen. Nothing moves, so no callback ever
 * fires again, and without re-arming from the token the new version would never be acknowledged.
 * Pass null to disable the directive entirely — no observer, no listeners, no cost.
 *
 * Fails closed throughout. Where a signal is missing or ambiguous it does not emit: "never read"
 * costs the office a phone call, while a receipt for something nobody saw costs a driver a missed
 * trip.
 */
@Directive({
  standalone: true,
  selector: '[appSeenWhenVisible]',
})
export class SeenWhenVisibleDirective {
  readonly appSeenWhenVisible = input<string | null>(null);
  readonly seen = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  private observer: IntersectionObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Whether the element last intersected the viewport at all — a cheap gate, not the decision.
   *  Kept because the resume and re-arm paths must decide when no callback is coming. */
  private intersecting = false;
  /** The token already emitted, so a token that keeps arriving unchanged emits only once. */
  private emitted: string | null = null;

  constructor() {
    this.zone.runOutsideAngular(() => {
      // A row already in view when the app went to the background gets no further
      // IntersectionObserver callback when it comes back, so without these it could never be
      // acknowledged. `visibilitychange` is unreliable in an installed iOS PWA, which is why it is
      // treated as an optimisation — cancelling a dwell that shouldn't complete — while
      // correctness rests on re-checking when the timer fires. `pageshow` covers a bfcache-style
      // restore, where visibilitychange may not fire at all.
      document.addEventListener('visibilitychange', this.reevaluate);
      window.addEventListener('pageshow', this.reevaluate);
      // Scroll and resize change what is *covering* the element without necessarily crossing an
      // IntersectionObserver threshold, so they are the signal that a row previously judged hidden
      // behind the bottom bars may now be readable. Capture, because scroll does not bubble and
      // the list may sit in its own scrolling container.
      window.addEventListener('scroll', this.reevaluate, {passive: true, capture: true});
      window.addEventListener('resize', this.reevaluate, {passive: true});
    });

    effect(() => {
      const token = this.appSeenWhenVisible();
      this.cancelDwell();
      if (token === null) {
        this.disconnect();
        return;
      }
      this.connect();
      // Already on screen and nothing about to move: start counting from here.
      if (this.intersecting) this.startDwell();
    });

    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', this.reevaluate);
      window.removeEventListener('pageshow', this.reevaluate);
      window.removeEventListener('scroll', this.reevaluate, {capture: true});
      window.removeEventListener('resize', this.reevaluate);
      this.cancelDwell();
      this.disconnect();
    });
  }

  private readonly reevaluate = (): void => {
    if (document.visibilityState !== 'visible') {
      this.cancelDwell();
      return;
    }
    if (this.intersecting) this.startDwell();
  };

  private connect(): void {
    if (this.observer) return;
    // Absent in a non-browser or very old environment. Failing closed means no receipts rather
    // than false ones.
    if (typeof IntersectionObserver === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      // Only a change signal — how much is really showing is measured at dwell time, because
      // IntersectionObserver cannot answer it (see probeUnobstructedHeight). The extra threshold
      // gives one more re-evaluation point as a row scrolls through.
      this.observer = new IntersectionObserver(entries => this.onIntersect(entries), {
        threshold: [0, SEEN_MIN_RATIO],
      });
      this.observer.observe(this.host.nativeElement);
    });
  }

  private disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.intersecting = false;
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    this.intersecting = entry.isIntersecting;
    if (this.intersecting) this.startDwell();
    else this.cancelDwell();
  }

  private startDwell(): void {
    const token = this.appSeenWhenVisible();
    if (token === null || token === this.emitted || this.timer !== null) return;
    if (document.visibilityState !== 'visible') return;
    this.zone.runOutsideAngular(() => {
      this.timer = setTimeout(() => {
        this.timer = null;
        // Re-checked rather than trusted: a timer can survive the app being backgrounded or frozen
        // and fire on resume, and this is the check the iOS event unreliability makes load-bearing.
        if (!this.intersecting || document.visibilityState !== 'visible') return;
        if (!this.visibleEnough()) return;
        const current = this.appSeenWhenVisible();
        if (current === null || current === this.emitted) return;
        this.emitted = current;
        this.zone.run(() => this.seen.emit(current));
      }, SEEN_DWELL_MS);
    });
  }

  private cancelDwell(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private visibleEnough(): boolean {
    const clear = probeUnobstructedHeight(this.host.nativeElement);
    if (clear.total <= 0) return false;
    return clear.unobstructed >= SEEN_MIN_HEIGHT_PX || clear.unobstructed / clear.total >= SEEN_MIN_RATIO;
  }
}

/**
 * How much of `el`'s height is both inside the viewport and not covered by something else.
 *
 * This exists because IntersectionObserver answers a different question than the one that matters
 * here. It reports intersection with the *layout viewport* and has no concept of occlusion, so a
 * row sitting underneath the app's fixed bottom nav — or the collapsible bar above it, or an open
 * dialog's backdrop — reports as fully visible at ratio 1. On an iPhone that meant trips were being
 * marked read while physically hidden behind the toolbars.
 *
 * Hit-testing with elementFromPoint answers the real question, and answers it for *any* occluder
 * rather than a hardcoded list of the ones that exist today. It also happens to cope with the
 * installed-PWA viewport bug documented at the top of styles.css: a point below the reported
 * viewport hit-tests to nothing, so the short-by-safe-area strip fails closed instead of counting.
 *
 * Sampling rather than exact geometry because exactness is not available — occluders can be any
 * shape, and the answer only has to be good enough to distinguish "behind the toolbar" from "on
 * screen". Runs once per dwell, so ~27 hit tests is nothing.
 */
export function probeUnobstructedHeight(el: Element): {unobstructed: number; total: number} {
  const rect = el.getBoundingClientRect();
  if (rect.height <= 0) return {unobstructed: 0, total: 0};

  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  const visibleHeight = bottom - top;
  if (visibleHeight <= 0) return {unobstructed: 0, total: rect.height};

  const xs = PROBE_COLUMNS
    .map(fraction => rect.left + rect.width * fraction)
    .filter(x => x >= 0 && x <= window.innerWidth);
  if (!xs.length) return {unobstructed: 0, total: rect.height};

  let clearRows = 0;
  for (let row = 0; row < PROBE_ROWS; row++) {
    const y = top + (visibleHeight * (row + 0.5)) / PROBE_ROWS;
    // A hit inside the element counts: elementFromPoint returns the innermost element, which for a
    // table row is one of its own cells. Anything else on top means something is covering it.
    const clear = xs.filter(x => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (hit === el || el.contains(hit));
    }).length;
    if (clear * 2 > xs.length) clearRows++;
  }

  return {unobstructed: visibleHeight * (clearRows / PROBE_ROWS), total: rect.height};
}
