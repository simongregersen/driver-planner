import {ChangeDetectionStrategy, Component, effect, inject, input, output} from '@angular/core';
import {ReactiveFormsModule, FormControl} from '@angular/forms';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatTimepickerModule} from '@angular/material/timepicker';
import {Moment} from 'moment';
import {DateUtility} from '../date-utility';

// A single date+time field that renders as a native <input type=date>/<input type=time> pair on
// mobile (opens the OS's own picker sheet, works in every browser) and as a Material
// datepicker+timepicker pair on desktop (consistent with the rest of the app's dialogs) — CSS
// alone toggles which pair is visible, the same technique already used for the calendar/compact
// date-field split on My Trips and Day Plans. The two pairs stay in sync through the single
// `value` Moment they both read from and write back to.
@Component({
  standalone: true,
  selector: 'app-date-time-field',
  templateUrl: './date-time-field.component.html',
  styleUrls: ['./date-time-field.component.css'],
  imports: [ReactiveFormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, MatTimepickerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateTimeFieldComponent {
  dateLabel = input('Dato');
  timeLabel = input('Tid');
  value = input<Moment | null>(null);
  valueChange = output<Moment | null>();

  private readonly dateUtility = inject(DateUtility);
  readonly minDate = this.dateUtility.minDate(5);
  readonly minDateInputValue = this.dateUtility.toDateInputValue(this.minDate);

  readonly materialDateControl = new FormControl<Moment | null>(null);
  readonly materialTimeControl = new FormControl<Moment | null>(null);

  constructor() {
    // Keeps the Material controls following the input `value` without feeding their own
    // valueChanges straight back into an update loop.
    effect(() => {
      const current = this.value();
      this.materialDateControl.setValue(current ? this.dateUtility.getDate(current) : null, {emitEvent: false});
      this.materialTimeControl.setValue(current, {emitEvent: false});
    });

    this.materialDateControl.valueChanges.subscribe(date => this.emit(date, this.materialTimeControl.value));
    this.materialTimeControl.valueChanges.subscribe(time => this.emit(this.materialDateControl.value, time));
  }

  nativeDateValue(): string {
    return this.dateUtility.toDateInputValue(this.value());
  }

  nativeTimeValue(): string {
    return this.dateUtility.toTimeInputValue(this.value());
  }

  onNativeDateChange(event: Event): void {
    const date = this.dateUtility.parseDateInputValue((event.target as HTMLInputElement).value);
    this.emit(date, this.materialTimeControl.value);
  }

  onNativeTimeChange(event: Event): void {
    const time = this.dateUtility.parseTimeInputValue((event.target as HTMLInputElement).value);
    this.emit(this.materialDateControl.value, time);
  }

  private emit(date: Moment | null, time: Moment | null): void {
    this.valueChange.emit(this.dateUtility.toMoment(date, time));
  }
}
