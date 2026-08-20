import {Component, signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {
  SEEN_DWELL_MS,
  SEEN_MIN_HEIGHT_PX,
  SEEN_MIN_RATIO,
  SeenWhenVisibleDirective,
  probeUnobstructedHeight,
} from './seen-when-visible.directive';

/**
 * The visibility and timing rules, tested against a fake IntersectionObserver and a stubbed
 * layout.
 *
 * jsdom does no layout, so nothing here could be measured for real — but that is not the loss it
 * sounds like. What matters about this directive is the decisions it makes given a geometry and a
 * set of events, and supplying those directly is both exact and able to stage situations a real
 * browser makes very hard to produce on demand: a row parked behind the bottom nav, a timer
 * surviving a frozen app, a token changing while the row sits still.
 */
class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly options: IntersectionObserverInit | undefined;
  observed: Element[] = [];
  disconnected = false;

  constructor(private readonly callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.options = options;
    FakeIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.push(el);
  }

  disconnect(): void {
    this.disconnected = true;
  }

  unobserve(): void {
    /* not used */
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  /** Report whether the element intersects the viewport, the way a browser would after a scroll.
   *  Only isIntersecting is consulted now — how much is really showing is measured separately. */
  report(isIntersecting: boolean): void {
    this.callback(
      [{isIntersecting, intersectionRatio: isIntersecting ? 1 : 0} as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }

  static latest(): FakeIntersectionObserver {
    return FakeIntersectionObserver.instances[FakeIntersectionObserver.instances.length - 1];
  }
}

const VIEWPORT_HEIGHT = 800;
const VIEWPORT_WIDTH = 320;

@Component({
  standalone: true,
  imports: [SeenWhenVisibleDirective],
  template: `<div [appSeenWhenVisible]="token()" (seen)="onSeen($event)"></div>`,
})
class HostComponent {
  readonly token = signal<string | null>('trip-1:100');
  readonly seen: string[] = [];

  onSeen(token: string): void {
    this.seen.push(token);
  }
}

describe('SeenWhenVisibleDirective', () => {
  let originalIO: typeof IntersectionObserver | undefined;
  let originalElementFromPoint: typeof document.elementFromPoint;
  let visibility: DocumentVisibilityState;
  /** Everything at or below this viewport y is covered by something else — the fixed bottom bars. */
  let coveredBelowY: number;
  let element: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeIntersectionObserver.instances = [];
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    originalElementFromPoint = document.elementFromPoint;
    visibility = 'visible';
    coveredBelowY = Infinity;
    Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => visibility});
    Object.defineProperty(window, 'innerHeight', {configurable: true, writable: true, value: VIEWPORT_HEIGHT});
    Object.defineProperty(window, 'innerWidth', {configurable: true, writable: true, value: VIEWPORT_WIDTH});
    document.elementFromPoint = ((_x: number, y: number) =>
      y >= coveredBelowY ? document.body : element) as typeof document.elementFromPoint;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    document.elementFromPoint = originalElementFromPoint;
    if (originalIO) globalThis.IntersectionObserver = originalIO;
    else delete (globalThis as {IntersectionObserver?: unknown}).IntersectionObserver;
  });

  /** Place the host element at a known position. Default: comfortably inside the viewport. */
  function place(box: {top?: number; height?: number} = {}): void {
    const top = box.top ?? 100;
    const height = box.height ?? 300;
    element.getBoundingClientRect = () => ({
      top, height, bottom: top + height, left: 0, right: VIEWPORT_WIDTH, width: VIEWPORT_WIDTH,
      x: 0, y: top, toJSON: () => ({}),
    }) as DOMRect;
  }

  function render(token: string | null = 'trip-1:100'): ComponentFixture<HostComponent> {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.token.set(token);
    fixture.detectChanges();
    element = fixture.nativeElement.querySelector('div');
    place();
    return fixture;
  }

  /** Move the page to hidden or visible and fire the event a browser would. */
  function setVisibility(state: DocumentVisibilityState): void {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('emits once the element has been in view for the dwell', () => {
    const fixture = render();
    FakeIntersectionObserver.latest().report(true);

    expect(fixture.componentInstance.seen).toEqual([]);
    vi.advanceTimersByTime(SEEN_DWELL_MS);

    expect(fixture.componentInstance.seen).toEqual(['trip-1:100']);
  });

  // The whole reason for the dwell: a row passing under the thumb on the way somewhere else has
  // not been read.
  it('does not emit when the element scrolls straight past', () => {
    const fixture = render();
    const io = FakeIntersectionObserver.latest();

    io.report(true);
    vi.advanceTimersByTime(SEEN_DWELL_MS - 100);
    io.report(false);
    vi.advanceTimersByTime(SEEN_DWELL_MS);

    expect(fixture.componentInstance.seen).toEqual([]);
  });

  it('emits only once while the element stays in view', () => {
    const fixture = render();
    const io = FakeIntersectionObserver.latest();

    io.report(true);
    vi.advanceTimersByTime(SEEN_DWELL_MS * 3);
    io.report(true);
    vi.advanceTimersByTime(SEEN_DWELL_MS * 3);

    expect(fixture.componentInstance.seen).toEqual(['trip-1:100']);
  });

  // The bug this was reported for. IntersectionObserver reports a row underneath the app's fixed
  // bottom bars as fully visible — it knows about the layout viewport and nothing about one
  // element covering another — so on an iPhone trips were being marked read while hidden.
  describe('covered by the fixed bottom bars', () => {
    it('does not emit for a row mostly hidden behind them', () => {
      const fixture = render();
      place({top: 100, height: 300});
      coveredBelowY = 190;

      FakeIntersectionObserver.latest().report(true);
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual([]);
    });

    it('still emits when only a sliver of the row is covered', () => {
      const fixture = render();
      place({top: 100, height: 300});
      coveredBelowY = 370;

      FakeIntersectionObserver.latest().report(true);
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual(['trip-1:100']);
    });

    // Uncovering a row — the bar collapsing, or the list scrolling up under it — moves nothing
    // across an IntersectionObserver threshold, so a scroll listener is what gets it re-examined.
    it('emits once a scroll brings the row clear of them', () => {
      const fixture = render();
      place({top: 100, height: 300});
      coveredBelowY = 190;
      FakeIntersectionObserver.latest().report(true);
      vi.advanceTimersByTime(SEEN_DWELL_MS);
      expect(fixture.componentInstance.seen).toEqual([]);

      coveredBelowY = Infinity;
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual(['trip-1:100']);
    });
  });

  describe('how much has to be visible', () => {
    it('ignores a row hanging mostly below the fold', () => {
      const fixture = render();
      place({top: VIEWPORT_HEIGHT - 100, height: 300});

      FakeIntersectionObserver.latest().report(true);
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual([]);
    });

    it('accepts a tall element showing enough pixels to read', () => {
      // A card taller than the viewport can never reach SEEN_MIN_RATIO, so height is the fallback.
      const fixture = render();
      place({top: SEEN_MIN_HEIGHT_PX - 1000, height: 1000});

      FakeIntersectionObserver.latest().report(true);
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual(['trip-1:100']);
    });

    it('watches for the element leaving entirely as well as for the threshold', () => {
      render();

      expect(FakeIntersectionObserver.latest().options?.threshold).toEqual([0, SEEN_MIN_RATIO]);
    });
  });

  describe('while the app is not in the foreground', () => {
    it('does not emit for a row on screen behind a hidden page', () => {
      const fixture = render();
      setVisibility('hidden');
      FakeIntersectionObserver.latest().report(true);
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual([]);
    });

    it('cancels a dwell that was already running when the app went away', () => {
      const fixture = render();
      FakeIntersectionObserver.latest().report(true);
      vi.advanceTimersByTime(SEEN_DWELL_MS - 100);

      setVisibility('hidden');
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual([]);
    });

    // No further IntersectionObserver callback arrives on resume, because nothing moved — so
    // without the resume listener this row could never be acknowledged.
    it('starts counting again when the app comes back with the row still on screen', () => {
      const fixture = render();
      FakeIntersectionObserver.latest().report(true);
      setVisibility('hidden');
      vi.advanceTimersByTime(SEEN_DWELL_MS * 2);
      expect(fixture.componentInstance.seen).toEqual([]);

      setVisibility('visible');
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual(['trip-1:100']);
    });

    // The event is deliberately not dispatched here. In an installed iOS PWA visibilitychange is
    // unreliable on a home-swipe, and a pending timer can survive the freeze and fire on resume —
    // so the guard that actually has to hold is the one re-read when the timer fires, not the
    // listener. Every other test in this block would still pass without it.
    it('does not emit when the page went away without telling us', () => {
      const fixture = render();
      FakeIntersectionObserver.latest().report(true);
      visibility = 'hidden';
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual([]);
    });

    it('recovers on pageshow, which is all a bfcache restore may give us', () => {
      const fixture = render();
      FakeIntersectionObserver.latest().report(true);
      setVisibility('hidden');
      vi.advanceTimersByTime(SEEN_DWELL_MS * 2);

      visibility = 'visible';
      window.dispatchEvent(new Event('pageshow'));
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual(['trip-1:100']);
    });
  });

  describe('the token', () => {
    it('does nothing at all when null', () => {
      const fixture = render(null);

      expect(FakeIntersectionObserver.instances).toEqual([]);
      expect(fixture.componentInstance.seen).toEqual([]);
    });

    // The case IntersectionObserver structurally cannot report: the office edits the trip while
    // its row is already sitting still on the driver's screen. Nothing moves, so no callback ever
    // comes again, and the new version would go unacknowledged forever.
    it('re-arms and emits again when it changes with the row still in view', () => {
      const fixture = render();
      FakeIntersectionObserver.latest().report(true);
      vi.advanceTimersByTime(SEEN_DWELL_MS);
      expect(fixture.componentInstance.seen).toEqual(['trip-1:100']);

      fixture.componentInstance.token.set('trip-1:200');
      fixture.detectChanges();
      vi.advanceTimersByTime(SEEN_DWELL_MS);

      expect(fixture.componentInstance.seen).toEqual(['trip-1:100', 'trip-1:200']);
    });

    it('stops observing once it goes null', () => {
      const fixture = render();
      const io = FakeIntersectionObserver.latest();

      fixture.componentInstance.token.set(null);
      fixture.detectChanges();

      expect(io.disconnected).toBe(true);
    });
  });

  it('disconnects when the host goes away', () => {
    const fixture = render();
    const io = FakeIntersectionObserver.latest();

    fixture.destroy();

    expect(io.disconnected).toBe(true);
  });

  // Fail closed: an environment without IntersectionObserver gets no receipts rather than false
  // ones, and above all does not crash the trip list it is attached to.
  it('does nothing where IntersectionObserver is unavailable', () => {
    delete (globalThis as {IntersectionObserver?: unknown}).IntersectionObserver;

    const fixture = render();
    vi.advanceTimersByTime(SEEN_DWELL_MS * 2);

    expect(fixture.componentInstance.seen).toEqual([]);
  });

  describe('probeUnobstructedHeight', () => {
    let el: HTMLElement;

    beforeEach(() => {
      el = document.createElement('div');
      element = el;
    });

    function boxed(top: number, height: number): HTMLElement {
      el.getBoundingClientRect = () => ({
        top, height, bottom: top + height, left: 0, right: VIEWPORT_WIDTH, width: VIEWPORT_WIDTH,
        x: 0, y: top, toJSON: () => ({}),
      }) as DOMRect;
      return el;
    }

    it('reports the whole height for an unobstructed element', () => {
      expect(probeUnobstructedHeight(boxed(100, 300))).toEqual({unobstructed: 300, total: 300});
    });

    it('clips to the viewport', () => {
      const {unobstructed, total} = probeUnobstructedHeight(boxed(VIEWPORT_HEIGHT - 100, 300));

      expect(total).toBe(300);
      expect(unobstructed).toBeCloseTo(100, 0);
    });

    it('discounts the part hidden behind an overlay', () => {
      coveredBelowY = 250;

      const {unobstructed} = probeUnobstructedHeight(boxed(100, 300));

      // Sampled in ninths, so this is the nearest band boundary rather than exactly 150.
      expect(unobstructed).toBeGreaterThan(100);
      expect(unobstructed).toBeLessThan(200);
    });

    it('reports nothing for an element entirely off screen', () => {
      expect(probeUnobstructedHeight(boxed(VIEWPORT_HEIGHT + 10, 300)).unobstructed).toBe(0);
    });

    it('reports nothing for an element with no height', () => {
      expect(probeUnobstructedHeight(boxed(100, 0))).toEqual({unobstructed: 0, total: 0});
    });
  });
});
