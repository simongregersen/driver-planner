import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import moment, {Moment} from 'moment';
import {TimeWheelComponent} from '../time-wheel/time-wheel.component';

export interface TimePickerDialogData {
  value: Moment | null;
}

// Matches the app-wide 15-minute granularity mat-timepicker was already configured with
// (interval="15m") — this is the mobile replacement for that, not a general-purpose picker, so
// there's no need to make the step configurable.
const MINUTE_STEP = 15;

// A wheel-style time picker in the same spirit as the touchUi datepicker's calendar dialog —
// launched from TimeFieldComponent on mobile in place of mat-timepicker's dropdown list, which
// doesn't have that same big-target, native-picker feel.
@Component({
  standalone: true,
  selector: 'app-time-picker-dialog',
  templateUrl: './time-picker-dialog.component.html',
  styleUrls: ['./time-picker-dialog.component.css'],
  imports: [MatDialogModule, MatButtonModule, TimeWheelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimePickerDialogComponent {
  private readonly data = inject<TimePickerDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<TimePickerDialogComponent, Moment>);

  readonly hours = Array.from({length: 24}, (_, i) => i);
  readonly minutes = Array.from({length: 60 / MINUTE_STEP}, (_, i) => i * MINUTE_STEP);

  private readonly initial = this.data.value ?? moment();
  readonly selectedHour = signal(this.initial.hours());
  readonly selectedMinute = signal(this.roundToStep(this.initial.minutes()));

  private roundToStep(minute: number): number {
    return Math.round(minute / MINUTE_STEP) * MINUTE_STEP % 60;
  }

  confirm(): void {
    this.dialogRef.close(moment().hours(this.selectedHour()).minutes(this.selectedMinute()).seconds(0).milliseconds(0));
  }
}
