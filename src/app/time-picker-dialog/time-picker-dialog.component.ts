import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import moment, {Moment} from 'moment';
import {TimeWheelComponent} from '../time-wheel/time-wheel.component';

export interface TimePickerDialogData {
  value: Moment | null;
  /** In minutes — matches TimeFieldComponent's own minuteStep input. */
  minuteStep: number;
}

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

  private readonly minuteStep = this.data.minuteStep;

  readonly hours = Array.from({length: 24}, (_, i) => i);
  readonly minutes = Array.from({length: 60 / this.minuteStep}, (_, i) => i * this.minuteStep);

  private readonly initial = this.data.value ?? moment();
  readonly selectedHour = signal(this.initial.hours());
  readonly selectedMinute = signal(this.roundToStep(this.initial.minutes()));

  private roundToStep(minute: number): number {
    return Math.round(minute / this.minuteStep) * this.minuteStep % 60;
  }

  confirm(): void {
    this.dialogRef.close(moment().hours(this.selectedHour()).minutes(this.selectedMinute()).seconds(0).milliseconds(0));
  }
}
