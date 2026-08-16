import {TestBed} from '@angular/core/testing';
import {CollapsibleBottomBarComponent} from './collapsible-bottom-bar.component';

// The bar floats over the scrollable page, so a drag on it must not scroll the page behind —
// but the expanded panel now has to be scrollable in its own right. Those two requirements pull
// in opposite directions, and getting the balance wrong is invisible until someone tries it on a
// phone, so it's pinned here.
describe('CollapsibleBottomBarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({imports: [CollapsibleBottomBarComponent]});
  });

  afterEach(() => TestBed.resetTestingModule());

  function create() {
    const fixture = TestBed.createComponent(CollapsibleBottomBarComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return {fixture, host, scroller: host.querySelector('.expand-panel-inner') as HTMLElement};
  }

  /**
   * jsdom neither applies the component's stylesheet nor lays anything out, so both halves of
   * "is this scrollable" have to be simulated: the computed overflow (via an inline style, which
   * getComputedStyle does reflect) and the scroll extent.
   */
  function setOverflowing(element: HTMLElement, overflowing: boolean) {
    element.style.overflowY = 'auto';
    Object.defineProperty(element, 'scrollHeight', {value: overflowing ? 400 : 100, configurable: true});
    Object.defineProperty(element, 'clientHeight', {value: 100, configurable: true});
  }

  /** The handler only reads target/preventDefault, so a plain cancelable Event is enough. */
  function touchMoveFrom(target: Element): boolean {
    const event = new Event('touchmove', {bubbles: true, cancelable: true});
    target.dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('blocks a drag on the collapsed row, which has nothing of its own to scroll', () => {
    const {host} = create();
    const collapsedRow = host.querySelector('.collapsed-row')!;
    expect(touchMoveFrom(collapsedRow)).toBe(true);
  });

  it('lets the browser scroll the expanded panel when it has somewhere to go', () => {
    const {scroller} = create();
    setOverflowing(scroller, true);
    // Not prevented: the browser scrolls the panel, and overscroll-behavior: contain (see the
    // CSS) is what stops that reaching the page once the panel hits its own end.
    expect(touchMoveFrom(scroller)).toBe(false);
  });

  it('still blocks a drag on the expanded panel when its content fits', () => {
    const {scroller} = create();
    setOverflowing(scroller, false);
    // Nothing to scroll here, so an unblocked drag would fall straight through to the page.
    expect(touchMoveFrom(scroller)).toBe(true);
  });

  it('lets a drag starting on a control inside the scrollable panel through', () => {
    const {scroller} = create();
    setOverflowing(scroller, true);
    const child = document.createElement('button');
    scroller.appendChild(child);
    // The target is the control, not the scroller — the handler has to walk up to find it.
    expect(touchMoveFrom(child)).toBe(false);
  });

  it('stops blocking once destroyed', () => {
    const {fixture, host} = create();
    const collapsedRow = host.querySelector('.collapsed-row')!;
    fixture.destroy();
    expect(touchMoveFrom(collapsedRow)).toBe(false);
  });

  it('toggles expanded state', () => {
    const {fixture} = create();
    expect(fixture.componentInstance.expanded()).toBe(false);
    fixture.componentInstance.toggle();
    expect(fixture.componentInstance.expanded()).toBe(true);
  });
});
