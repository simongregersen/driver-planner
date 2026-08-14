import {ChangeDetectionStrategy, Component, OnInit, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatTooltipModule} from '@angular/material/tooltip';
import moment, {Moment} from 'moment';
import {ClockRecord} from '../clock-record';
import {DataStore} from '../data.service';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {DateTimeFieldComponent} from '../date-time-field/date-time-field.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';

export type ClockRecordFormMode = 'create' | 'edit';

export interface ClockRecordUpdates {
  clockIn: Moment;
  clockOut: Moment | null;
  note: string | null;
}

// Create and edit share one form, following DriverFormComponent/FuelReportFormComponent's
// convention — replaces the previously separate ClockRecordCreatorComponent/
// ClockRecordEditorComponent. ClockRecordStopComponent stays its own component on purpose: it's
// specifically the "confirm and stop" step (clockOut always defaults to now, primary action is a
// red "Stop"), a distinct workflow from either starting or correcting a record — sharing one
// component there made stopping and correcting indistinguishable from each other.
//
// Opened via MatDialog.open() with no data binding — mode/driverKey/record/initialClockIn are
// set directly on componentInstance by the caller straight after open(); that assignment happens
// before Angular runs ngOnInit (dialog creation defers it), so ngOnInit sees the final values.
@Component({
  standalone: true,
  selector: 'app-clock-record-form',
  templateUrl: './clock-record-form.component.html',
  styleUrls: ['./clock-record-form.component.css'],
  imports: [
    FormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule,
    DateTimeFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClockRecordFormComponent implements OnInit {
  mode: ClockRecordFormMode = 'create';
  driverKey!: string;
  /** Required when mode is 'edit'. */
  record!: ClockRecord;
  /** Create mode only: pre-fills "Start" with this day instead of defaulting to now — used when
   * a record is added for a specific day from the report view rather than punched in live. */
  initialClockIn?: Moment;

  private readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<ClockRecordFormComponent>);

  clockIn: Moment | null = null;
  clockOut: Moment | null = null;
  note = '';

  ngOnInit(): void {
    const isEdit = this.mode === 'edit';
    this.clockIn = isEdit
      ? moment(this.record.clockIn)
      : (this.initialClockIn ? this.initialClockIn.clone() : this.roundToQuarterHour(moment()));
    this.clockOut = (isEdit && this.record.clockOut) ? moment(this.record.clockOut) : null;
    this.note = isEdit ? (this.record.note ?? '') : '';
  }

  clearClockOut(): void {
    this.clockOut = null;
  }

  error(): string | null {
    if (!this.clockIn || !this.clockIn.isValid()) return 'Ugyldig dato eller tid for "Start".';
    if (this.clockOut && !this.clockOut.isValid()) return 'Ugyldig dato eller tid for "Slut".';
    if (this.clockOut && this.clockOut.isBefore(this.clockIn)) return '"Slut" kan ikke være før "Start".';
    return null;
  }

  onSubmit(): void {
    if (this.error()) return;
    const note = this.note.trim() || null;
    if (this.mode === 'edit') {
      this.dataStore.updateClockRecord(this.driverKey, this.record, {clockIn: this.clockIn!, clockOut: this.clockOut, note});
    } else {
      this.dataStore.addClockRecord(this.driverKey, this.clockIn!, note);
    }
  }

  confirmDelete(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: 'Er du sikker på, at du vil slette denne registrering?',
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.dataStore.removeClockRecord(this.driverKey, this.record);
        this.dialogRef.close();
      }
    });
  }

  private roundToQuarterHour(m: Moment): Moment {
    return m.clone().minutes(Math.round(m.minutes() / 15) * 15).seconds(0).milliseconds(0);
  }
}
