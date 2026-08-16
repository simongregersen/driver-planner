import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
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
import {WriteFeedbackService} from '../write-feedback.service';
import {guardDialogDismissal} from '../dialog-dismiss-guard';

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
  private save!: (record: ClockRecord, updates: ClockRecordUpdates) => Promise<unknown>;
  private removeRecord!: (record: ClockRecord) => Promise<unknown>;
  private record!: ClockRecord;

  private readonly dialog = inject(MatDialog);
  private readonly writeFeedback = inject(WriteFeedbackService);

  /** True while a submit's write is in flight. Gates the submit button so a slow connection
   * can't turn an impatient second tap into a second record — and stays true for a write that
   * hasn't been acknowledged yet, which offline is every write. See WriteFeedbackService. */
  readonly saving = signal(false);
  readonly dialogRef = inject(MatDialogRef<ClockRecordStopComponent>);

  clockIn: Moment | null = null;
  clockOut: Moment | null = null;
  note = '';
  // No UI for this here — stopping a record shouldn't change its Døgnbetaling scheme, only
  // ClockRecordFormComponent's "correct a record" form lets that be set.
  private dognbetaling = false;

  /** Field values as open() left them — template-driven form, so there's no FormGroup.dirty for
   * the dismissal guard to consult. Note that clockOut is pre-filled with "now", so the guard
   * correctly treats simply opening and dismissing this dialog as not dirty. */
  private pristineSnapshot = '';

  constructor() {
    guardDialogDismissal(this.dialogRef, () => this.snapshot() !== this.pristineSnapshot);
  }

  public open(record: ClockRecord, save: (record: ClockRecord, updates: ClockRecordUpdates) => Promise<unknown>, remove: (record: ClockRecord) => Promise<unknown>): void {
    this.record = record;
    this.save = save;
    this.removeRecord = remove;

    this.clockIn = moment(record.clockIn);
    this.clockOut = this.roundToFiveMinutes(moment());
    this.note = record.note ?? '';
    this.dognbetaling = !!record.dognbetaling;
    this.pristineSnapshot = this.snapshot();
  }

  private snapshot(): string {
    return JSON.stringify([this.clockIn?.valueOf() ?? null, this.clockOut?.valueOf() ?? null, this.note]);
  }

  error(): string | null {
    if (!this.clockIn || !this.clockIn.isValid()) return 'Ugyldig dato eller tid for "Start".';
    if (!this.clockOut || !this.clockOut.isValid()) return 'Ugyldig dato eller tid for "Slut".';
    if (this.clockOut.isBefore(this.clockIn)) return '"Slut" kan ikke være før "Start".';
    return null;
  }

  onSubmit(): void {
    if (this.saving()) return;
    if (this.error()) return;
    const saved = this.save(this.record, {clockIn: this.clockIn!, clockOut: this.clockOut, note: this.note.trim() || null, dognbetaling: this.dognbetaling});
    void this.writeFeedback.closeDialogOn(this.dialogRef, saved, this.saving);
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
        void this.writeFeedback.closeDialogOn(
          this.dialogRef, this.removeRecord(this.record), this.saving, {failureMessage: 'Kunne ikke slette registreringen. Prøv igen.'});
      }
    });
  }

  private roundToFiveMinutes(m: Moment): Moment {
    return m.clone().minutes(Math.round(m.minutes() / 5) * 5).seconds(0).milliseconds(0);
  }
}
