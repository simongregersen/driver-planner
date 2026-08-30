import {ChangeDetectionStrategy, Component, effect, inject, input, output} from '@angular/core';
import {ReactiveFormsModule, FormControl} from '@angular/forms';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Moment} from 'moment';
import {DateUtility} from '../date-utility';
import {BreakpointService} from '../breakpoint.service';
import {TimeFieldComponent} from '../time-field/time-field.component';

// A single date+time field, matching the rest of the app's dialogs — a touchUi datepicker for
// the date (a full-screen, touch-friendly calendar on mobile instead of desktop's small anchored
// popup) paired with TimeFieldComponent for the time, which does the equivalent mobile/desktop
// split of its own (see that component).
//
// Used by the clock-record form/stop dialogs (Tidsregistrering) and TripReportFormComponent
// (Chaufførrapport).
//
// Previously had a native <input type=date>/<input type=time> pair as a mobile fallback instead
// — dropped because mobile browsers don't reliably respect the time input's step attribute (it
// only affected form validation, not the picker UI: a user could freely scroll to any minute),
// which needed a manual rounding workaround on every change.
@Component({
  standalone: true,
  selector: 'app-date-time-field',
  templateUrl: './date-time-field.component.html',
  styleUrls: ['./date-time-field.component.css'],
  imports: [ReactiveFormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, TimeFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateTimeFieldComponent {
  dateLabel = input('Dato');
  timeLabel = input('Tid');
  value = input<Moment | null>(null);
  /** Value to fall back to for whichever half (date or time) the user hasn't picked yet here —
   * e.g. Slut defaulting to Start's date when only a Slut time is typed, and to Start's time
   * when only a Slut date is picked. */
  fallbackValue = input<Moment | null>(null);
  /** The same seeding, but from the current date and time — for a field deliberately left blank
   * until it's being filled in (Chaufførrapport's Slut, entered when the driver finishes, long
   * after the report was first created). Both halves follow: opening the time seeds today's date
   * with it, and picking a date alone seeds the current time. Read at the moment the field is
   * used rather than when the dialog opened. Takes precedence over fallbackValue. */
  defaultsToNow = input(false);
  /** In minutes — passed through to the time half, and the step defaultsToNow rounds to. */
  minuteStep = input(5);
  /** Passed through to the time half — see TimeFieldComponent.clearable. Clearing it here empties
   * the date as well, since half a timestamp is not a value this field can emit. */
  clearable = input(false);
  clearLabel = input('Ryd tid');
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

  /** Clearing runs after TimeFieldComponent has already emptied its own control, which by itself
   * would trip emit()'s "fill the missing half from the fallback" rule and immediately re-seed
   * the time it just cleared. Emptying both halves here — after that has happened — is what makes
   * the clear stick. */
  onCleared(): void {
    this.materialDateControl.setValue(null, {emitEvent: false});
    this.materialTimeControl.setValue(null, {emitEvent: false});
    this.valueChange.emit(null);
  }

  private emit(date: Moment | null, time: Moment | null): void {
    const fallback = this.defaultsToNow() ? this.dateUtility.nowRoundedTo(this.minuteStep()) : this.fallbackValue();
    if (!date && time && fallback) {
      date = this.dateUtility.getDate(fallback);
      this.materialDateControl.setValue(date, {emitEvent: false});
    }
    if (!time && date && fallback) {
      time = fallback;
      this.materialTimeControl.setValue(time, {emitEvent: false});
    }
    this.valueChange.emit(this.dateUtility.toMoment(date, time));
  }
}
