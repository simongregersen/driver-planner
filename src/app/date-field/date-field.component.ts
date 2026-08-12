import {ChangeDetectionStrategy, Component, effect, inject, input, output} from '@angular/core';
import {ReactiveFormsModule, FormControl} from '@angular/forms';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Moment} from 'moment';
import {BreakpointService} from '../breakpoint.service';

// A single date-only field (no time component) — always a Material datepicker, touchUi on
// mobile (a full-screen, touch-friendly calendar dialog instead of the small anchored popup
// desktop gets). Used for a birthday, an inspection date, etc.; split out from
// DateTimeFieldComponent since those don't need a paired time picker.
//
// Previously had a native <input type=date> fallback on mobile instead — dropped because
// mobile browsers don't reliably respect min/step on native date/time inputs (confirmed on
// date-time-field's time input; see git history), so touchUi is the more robust choice.
@Component({
  standalone: true,
  selector: 'app-date-field',
  templateUrl: './date-field.component.html',
  styleUrls: ['./date-field.component.css'],
  imports: [ReactiveFormsModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateFieldComponent {
  label = input('Dato');
  value = input<Moment | null>(null);
  minDate = input<Moment | undefined>(undefined);
  startView = input<'month' | 'year' | 'multi-year'>('month');
  valueChange = output<Moment | null>();

  readonly breakpoints = inject(BreakpointService);

  readonly materialDateControl = new FormControl<Moment | null>(null);

  constructor() {
    effect(() => {
      this.materialDateControl.setValue(this.value(), {emitEvent: false});
    });

    this.materialDateControl.valueChanges.subscribe(date => this.valueChange.emit(date));
  }
}
