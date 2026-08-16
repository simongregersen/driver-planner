import {ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, inject, signal} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {findScrollableAncestor} from '../touch-scroll';

// A bottom-pinned bar with an always-visible row (bar-collapsed) and a second row
// (bar-expanded) that's collapsed by default and toggled open with the triangle button — on
// short-height screens the always-expanded version of this bar (the previous design) ate too
// much of the little vertical space left for actual content.
@Component({
  standalone: true,
  selector: 'app-collapsible-bottom-bar',
  templateUrl: './collapsible-bottom-bar.component.html',
  styleUrls: ['./collapsible-bottom-bar.component.css'],
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollapsibleBottomBarComponent implements OnInit, OnDestroy {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly expanded = signal(false);

  toggle(): void {
    this.expanded.update(value => !value);
  }

  // This bar floats fixed on top of the scrollable page, so a vertical drag on it used to fall
  // through and scroll the page underneath, which read as the bar not really being "there".
  //
  // The original fix blocked *every* touchmove on the host, on the assumption that nothing inside
  // the bar needed to be dragged. That stopped being true once the expanded panel grew tall
  // enough to need scrolling of its own (Day Plans' mobile bar carries a date field, the
  // operations buttons and three chip filters) — the panel became unscrollable by touch.
  //
  // So the block is now conditional: a drag that starts inside the expanded panel, and where that
  // panel actually has somewhere left to scroll, is handed to the browser. `overscroll-behavior:
  // contain` on that panel (see the CSS) is what keeps such a scroll from chaining into the page
  // once it reaches its own top or bottom — the same technique styles.css already relies on for
  // dialog content. Every other part of the bar has nothing to scroll, so it stays blocked.
  private readonly onTouchMove = (event: TouchEvent): void => {
    // findScrollableAncestor matches on *computed* overflow plus real scroll extent rather than
    // on a known class, because the element that ends up being the scroll port is whatever the
    // layout actually produced — not necessarily the one a stylesheet nominated. An earlier
    // version of this looked for `.expand-panel-inner` by selector and did not work on a device.
    // The walk stops at this component's own host, so it can never mistake the page itself for
    // somewhere the drag may go.
    const host = this.elementRef.nativeElement;
    const scrollable = findScrollableAncestor(event.target, element => element === host.parentElement);
    if (scrollable) return;
    event.preventDefault();
  };

  ngOnInit(): void {
    // passive: false because the handler conditionally calls preventDefault.
    this.elementRef.nativeElement.addEventListener('touchmove', this.onTouchMove, {passive: false});
  }

  ngOnDestroy(): void {
    this.elementRef.nativeElement.removeEventListener('touchmove', this.onTouchMove);
  }
}
