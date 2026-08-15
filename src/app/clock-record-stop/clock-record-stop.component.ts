import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import moment, {Moment} from 'moment';
import {ClockRecord} from '../clock-record';
import {ClockRecordUpdates} from '../clock-record-form/clock-record-form.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {DateTimeFieldComponent} from '../date-time-field/date-time-field.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';

// Separate from ClockRecordFormComponent on purpose: this is specifically the "confirm and
// stop" step (clockOut always defaults to now, primary action is a red "Stop"), whereas the
// form is a plain start/correction form (clockOut stays blank unless the record already has one).
// Sharing one component made stopping and correcting indistinguishable from each other.
@Component({
  standalone: true,
  selector: 'app-clock-record-stop',
  templateUrl: './clock-record-stop.component.html',
  styleUrls: ['./clock-record-stop.component.css'],
  imports: [
    FormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    DateTimeFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClockRecordStopComponent {
  private save!: (record: ClockRecord, updates: ClockRecordUpdates) => void;
  private removeRecord!: (record: ClockRecord) => void;
  private record!: ClockRecord;

  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<ClockRecordStopComponent>);

  clockIn: Moment | null = null;
  clockOut: Moment | null = null;
  note = '';

  public open(record: ClockRecord, save: (record: ClockRecord, updates: ClockRecordUpdates) => void, remove: (record: ClockRecord) => void): void {
    this.record = record;
    this.save = save;
    this.removeRecord = remove;

    this.clockIn = moment(record.clockIn);
    this.clockOut = this.roundToFiveMinutes(moment());
    this.note = record.note ?? '';
  }

  error(): string | null {
    if (!this.clockIn || !this.clockIn.isValid()) return 'Ugyldig dato eller tid for "Start".';
    if (!this.clockOut || !this.clockOut.isValid()) return 'Ugyldig dato eller tid for "Slut".';
    if (this.clockOut.isBefore(this.clockIn)) return '"Slut" kan ikke være før "Start".';
    return null;
  }

  onSubmit(): void {
    if (this.error()) return;
    this.save(this.record, {clockIn: this.clockIn!, clockOut: this.clockOut, note: this.note.trim() || null});
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
        this.removeRecord(this.record);
        this.dialogRef.close();
      }
    });
  }

  private roundToFiveMinutes(m: Moment): Moment {
    return m.clone().minutes(Math.round(m.minutes() / 5) * 5).seconds(0).milliseconds(0);
  }
}
