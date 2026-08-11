import {ChangeDetectionStrategy, Component, effect, inject, input, output} from '@angular/core';
import {ReactiveFormsModule, FormControl} from '@angular/forms';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Moment} from 'moment';
import {DateUtility} from '../date-utility';

// A single date-only field (no time component) that renders as a native <input type=date> on
// mobile and a Material datepicker on desktop — same CSS-toggle technique as
// DateTimeFieldComponent, split out separately since date-only fields (a birthday, an
// inspection date) don't need a paired time picker.
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

  private readonly dateUtility = inject(DateUtility);
  readonly minDateInputValue = () => this.minDate() ? this.dateUtility.toDateInputValue(this.minDate()!) : '';

  readonly materialDateControl = new FormControl<Moment | null>(null);

  constructor() {
    effect(() => {
      this.materialDateControl.setValue(this.value(), {emitEvent: false});
    });

    this.materialDateControl.valueChanges.subscribe(date => this.valueChange.emit(date));
  }

  nativeDateValue(): string {
    return this.dateUtility.toDateInputValue(this.value());
  }

  onNativeDateChange(event: Event): void {
    this.valueChange.emit(this.dateUtility.parseDateInputValue((event.target as HTMLInputElement).value));
  }
}
