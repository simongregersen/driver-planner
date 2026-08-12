import {ChangeDetectionStrategy, Component, effect, inject, input, output} from '@angular/core';
import {ReactiveFormsModule, FormControl} from '@angular/forms';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatTimepickerModule} from '@angular/material/timepicker';
import {Moment} from 'moment';
import {DateUtility} from '../date-utility';
import {BreakpointService} from '../breakpoint.service';

// A single date+time field — a Material datepicker+timepicker pair, matching the rest of the
// app's dialogs, with touchUi on the datepicker for a full-screen, touch-friendly calendar on
// mobile instead of desktop's small anchored popup. The timepicker's own dropdown list (15-
// minute interval) is already touch-friendly as-is, no separate mobile treatment needed there.
//
// Used only by the clock-record creator/editor/stop dialogs (Tidsregistrering).
//
// Previously had a native <input type=date>/<input type=time> pair as a mobile fallback instead
// — dropped because mobile browsers don't reliably respect the time input's step attribute (it
// only affected form validation, not the picker UI: a user could freely scroll to any minute,
// unlike the Material timepicker's fixed 15-minute list), which needed a manual rounding
// workaround on every change; touchUi is the more robust choice and needs no such workaround.
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
  readonly breakpoints = inject(BreakpointService);

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

  private emit(date: Moment | null, time: Moment | null): void {
    this.valueChange.emit(this.dateUtility.toMoment(date, time));
  }
}
