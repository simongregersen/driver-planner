import {ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, inject, signal} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';

function preventDefault(event: TouchEvent): void {
  event.preventDefault();
}

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

  // This bar floats fixed on top of the scrollable page, with nothing inside it (buttons, a
  // date field, chip filters that wrap rather than scroll) that itself needs a touch-drag — on
  // mobile, without this, a vertical drag starting anywhere on it fell through to scroll the
  // page underneath, which read as the bar not really being "there".
  ngOnInit(): void {
    this.elementRef.nativeElement.addEventListener('touchmove', preventDefault, {passive: false});
  }

  ngOnDestroy(): void {
    this.elementRef.nativeElement.removeEventListener('touchmove', preventDefault);
  }
}
