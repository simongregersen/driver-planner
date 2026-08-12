import {AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, ViewChild, input, output} from '@angular/core';

// Must match the item/spacer heights in time-wheel.component.css — kept as one constant since
// scroll positions below are computed from it directly (index * ITEM_HEIGHT).
const ITEM_HEIGHT = 40;

// One scrollable, snap-to-center column of a native-style wheel time picker (see
// TimePickerDialogComponent, which places two of these side by side for hours/minutes).
@Component({
  standalone: true,
  selector: 'app-time-wheel',
  templateUrl: './time-wheel.component.html',
  styleUrls: ['./time-wheel.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeWheelComponent implements AfterViewInit {
  values = input.required<number[]>();
  value = input.required<number>();
  valueChange = output<number>();

  @ViewChild('scroller') private scroller!: ElementRef<HTMLDivElement>;

  ngAfterViewInit(): void {
    this.scrollToValue(this.value(), false);
  }

  pad(value: number): string {
    return value.toString().padStart(2, '0');
  }

  selectByClick(value: number): void {
    this.scrollToValue(value, true);
    this.valueChange.emit(value);
  }

  // scroll-snap-type (see CSS) does the actual settling to the nearest item natively — this
  // just reads where that landed so the "selected" highlight and the emitted value track it
  // continuously as the user scrolls, not only once scrolling has fully stopped.
  onScroll(): void {
    const element = this.scroller.nativeElement;
    const index = Math.round(element.scrollTop / ITEM_HEIGHT);
    const clamped = Math.min(Math.max(index, 0), this.values().length - 1);
    const scrolledTo = this.values()[clamped];
    if (scrolledTo !== this.value()) {
      this.valueChange.emit(scrolledTo);
    }
  }

  private scrollToValue(value: number, smooth: boolean): void {
    const index = this.values().indexOf(value);
    if (index === -1) {
      return;
    }
    if (smooth) {
      this.scroller.nativeElement.scrollTo({top: index * ITEM_HEIGHT, behavior: 'smooth'});
    } else {
      this.scroller.nativeElement.scrollTop = index * ITEM_HEIGHT;
    }
  }
}
