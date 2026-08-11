import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatTooltipModule} from '@angular/material/tooltip';
import moment, {Moment} from 'moment';
import {ClockRecord} from '../clock-record';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {DateTimeFieldComponent} from '../date-time-field/date-time-field.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';

export interface ClockRecordUpdates {
  clockIn: Moment;
  clockOut: Moment | null;
  note: string | null;
}

@Component({
  standalone: true,
  selector: 'app-clock-record-editor',
  templateUrl: './clock-record-editor.component.html',
  styleUrls: ['./clock-record-editor.component.css'],
  imports: [
    FormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule,
    DateTimeFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClockRecordEditorComponent {
  private save!: (record: ClockRecord, updates: ClockRecordUpdates) => void;
  private removeRecord!: (record: ClockRecord) => void;
  private record!: ClockRecord;

  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<ClockRecordEditorComponent>);

  clockIn: Moment | null = null;
  clockOut: Moment | null = null;
  note = '';

  public edit(record: ClockRecord, save: (record: ClockRecord, updates: ClockRecordUpdates) => void, remove: (record: ClockRecord) => void): void {
    this.record = record;
    this.save = save;
    this.removeRecord = remove;

    this.clockIn = moment(record.clockIn);
    this.clockOut = record.clockOut ? moment(record.clockOut) : null;
    this.note = record.note ?? '';
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
}
