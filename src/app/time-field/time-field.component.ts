import {ChangeDetectionStrategy, Component, forwardRef, inject, input, output, signal} from '@angular/core';
import {FormControl, NG_VALUE_ACCESSOR, ControlValueAccessor, ReactiveFormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatTimepickerModule} from '@angular/material/timepicker';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Moment} from 'moment';
import {BreakpointService} from '../breakpoint.service';
import {TIME_PICKER_DIALOG_CONFIG} from '../dialog-config';
import {TimePickerDialogComponent, TimePickerDialogData} from '../time-picker-dialog/time-picker-dialog.component';

// A time-only field. Desktop keeps Material's own mat-timepicker (a small dropdown list) — it's
// already touch-friendly-enough and has no reported issue. Mobile instead opens
// TimePickerDialogComponent, a wheel-style picker mimicking a native time picker's feel, in the
// same spirit as the touchUi datepicker's own calendar dialog (mat-timepicker's dropdown list
// doesn't have that same big-target, native feel, and the actual native <input type=time> isn't
// usable here — see git history — since iOS doesn't respect its step attribute).
// Both paths converge on the same FormControl, so either one flows through this component's own
// ControlValueAccessor identically.
@Component({
  standalone: true,
  selector: 'app-time-field',
  templateUrl: './time-field.component.html',
  styleUrls: ['./time-field.component.css'],
  imports: [ReactiveFormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTimepickerModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => TimeFieldComponent),
    multi: true,
  }],
})
export class TimeFieldComponent implements ControlValueAccessor {
  label = input('Tid');
  /** In minutes — governs the desktop dropdown's option list and the mobile wheel dialog's
   * options; typing a time directly on desktop isn't restricted to this step. */
  minuteStep = input(5);
  /** Seeded into the field the moment it's opened with no time of its own yet — e.g. Slut
   * opening already showing Start's time instead of blank/now, on both the desktop dropdown and
   * the mobile wheel dialog. */
  fallbackTime = input<Moment | null>(null);
  /** Shows a clear button in the field's own suffix whenever it holds a value. Worth turning on
   * wherever `fallbackTime` is used: seeding commits a value on the very first click, so without
   * a way back, opening the field by accident leaves a value the user never chose and may not be
   * able to remove. */
  clearable = input(false);
  clearLabel = input('Ryd tid');
  /** Emitted after the field clears itself, so a host that treats this time as half of a pair
   * (TripFormComponent's Til dato/Til tid) can clear the other half too. */
  readonly cleared = output<void>();

  readonly breakpoints = inject(BreakpointService);
  private readonly dialog = inject(MatDialog);

  readonly materialTimeControl = new FormControl<Moment | null>(null);
  readonly displayValue = signal('');

  // Real implementations arrive via registerOnChange/registerOnTouched below before Angular
  // Forms ever calls either — these no-op defaults just cover the brief window before that
  // registration happens, the standard ControlValueAccessor pattern.
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onChange: (value: Moment | null) => void = () => {};
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private onTouched: () => void = () => {};

  constructor() {
    this.materialTimeControl.valueChanges.subscribe(value => {
      this.displayValue.set(value ? value.format('HH:mm') : '');
      this.onChange(value);
    });
  }

  writeValue(value: Moment | null): void {
    this.materialTimeControl.setValue(value, {emitEvent: false});
    this.displayValue.set(value ? value.format('HH:mm') : '');
  }

  registerOnChange(fn: (value: Moment | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    if (isDisabled) {
      this.materialTimeControl.disable({emitEvent: false});
    } else {
      this.materialTimeControl.enable({emitEvent: false});
    }
  }

  // Bound to the whole mat-form-field (not just the input) so clicking the suffix icon opens
  // the picker too, matching how clicking anywhere in a datepicker field opens the calendar.
  // Desktop's own mat-timepicker already opens from its own toggle/input clicks independently,
  // so this only needs to act on mobile.
  onFieldClick(): void {
    if (!this.materialTimeControl.value) {
      const fallback = this.fallbackTime();
      if (fallback) {
        this.materialTimeControl.setValue(fallback);
      }
    }
    if (this.breakpoints.isMobile()) {
      this.open();
    }
  }

  clear(event: Event): void {
    // The wrapping mat-form-field has its own (click)=onFieldClick, which would immediately
    // re-seed this field from fallbackTime — and reopen the picker on mobile — undoing the clear
    // the instant it happened.
    event.stopPropagation();
    this.materialTimeControl.setValue(null);
    this.onTouched();
    this.cleared.emit();
  }

  private open(): void {
    if (this.materialTimeControl.disabled) {
      return;
    }
    this.onTouched();
    this.dialog.open<TimePickerDialogComponent, TimePickerDialogData, Moment>(TimePickerDialogComponent, {
      ...TIME_PICKER_DIALOG_CONFIG,
      data: {value: this.materialTimeControl.value, minuteStep: this.minuteStep()},
    }).afterClosed().subscribe(result => {
      if (result) {
        this.materialTimeControl.setValue(result);
      }
    });
  }
}
