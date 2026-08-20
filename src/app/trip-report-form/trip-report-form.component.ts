import {ChangeDetectionStrategy, Component, OnInit, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {AsyncPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule, MatButtonToggleChange} from '@angular/material/button-toggle';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Observable} from 'rxjs';
import {Moment} from 'moment';
import {Trip, TripReport} from '../trip';
import {Driver} from '../driver';
import {DataStore} from '../data.service';
import {DateTimeFieldComponent} from '../date-time-field/date-time-field.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';
import {WriteFeedbackService} from '../write-feedback.service';
import {guardDialogDismissal} from '../dialog-dismiss-guard';

// A single driver's own report for one trip — opened either by that driver themselves from
// "Min dag" (TripsComponent's report button) or by an admin from Dagsplaner
// (TripReportsDialogComponent) editing a specific driver's report on their behalf. Always a
// create-or-replace: there's at most one report per driver per trip, so there's no separate
// create/edit mode to track — ngOnInit just checks whether trip.reports[driverKey] already
// exists and pre-fills from it if so.
//
// Opened via MatDialog.open() with no data binding — `trip`/`driverKey` are set directly on
// componentInstance by the caller straight after open(); that assignment happens before Angular
// runs ngOnInit (dialog creation defers it), so ngOnInit sees the final values.
@Component({
  standalone: true,
  selector: 'app-trip-report-form',
  templateUrl: './trip-report-form.component.html',
  styleUrls: ['./trip-report-form.component.css'],
  imports: [
    FormsModule, AsyncPipe,
    MatButtonModule, MatButtonToggleModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    DateTimeFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripReportFormComponent implements OnInit {
  trip!: Trip;
  driverKey!: string;

  private readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);
  private readonly writeFeedback = inject(WriteFeedbackService);

  /** True while a submit's write is in flight. Gates the submit button so a slow connection
   * can't turn an impatient second tap into a second record — and stays true for a write that
   * hasn't been acknowledged yet, which offline is every write. See WriteFeedbackService. */
  readonly saving = signal(false);
  readonly dialogRef = inject(MatDialogRef<TripReportFormComponent>);

  // Null when the driver record has since been removed — the title already renders that case
  // as a plain "Chaufførrapport" with no name (see the template's @if).
  driver$!: Observable<Driver | null>;
  /** Whether trip.reports[driverKey] already existed on open — gates the "Slet" button, which
   * only makes sense once there's actually a report to delete. */
  hasExistingReport = false;

  // Time readings default to "ved kunden" (a driver typically clocks in/out at the customer);
  // km readings default to "garagen" (the odometer is usually read back at the garage) — see
  // the doc comment on TripReport for why each reading gets its own independent flag.
  start: Moment | null = null;
  startFromCustomer = true;
  end: Moment | null = null;
  endFromCustomer = true;
  startKm: number | null = null;
  startKmFromCustomer = false;
  endKm: number | null = null;
  endKmFromCustomer = false;
  note = '';

  constructor() {
    guardDialogDismissal(this.dialogRef, () => this.snapshot() !== this.pristineSnapshot);
  }

  ngOnInit(): void {
    this.driver$ = this.dataStore.getDriver(this.driverKey);

    const existing = this.trip.reports?.[this.driverKey];
    this.hasExistingReport = !!existing;
    if (existing) {
      this.start = existing.start;
      this.startFromCustomer = existing.startFromCustomer;
      this.end = existing.end;
      this.endFromCustomer = existing.endFromCustomer;
      this.startKm = existing.startKm;
      this.startKmFromCustomer = existing.startKmFromCustomer;
      this.endKm = existing.endKm;
      this.endKmFromCustomer = existing.endKmFromCustomer;
      this.note = existing.note;
    } else {
      // Reasonable starting points for a driver to adjust rather than blank fields — the trip's
      // own schedule, not a guess at km.
      this.start = this.trip.start;
      this.end = this.trip.end;
    }
    this.pristineSnapshot = this.snapshot();
  }

  /** Field values as ngOnInit left them. Template-driven form, so there's no FormGroup.dirty for
   * the dismissal guard to consult — and this is the dialog where losing input hurts most: a
   * driver stood at the bus has typically entered two timestamps, two odometer readings, four
   * garage/kunde toggles and a note by the time a stray backdrop tap could discard it. */
  private pristineSnapshot = '';

  private snapshot(): string {
    return JSON.stringify([
      this.start?.valueOf() ?? null, this.startFromCustomer,
      this.end?.valueOf() ?? null, this.endFromCustomer,
      this.startKm, this.startKmFromCustomer,
      this.endKm, this.endKmFromCustomer,
      this.note,
    ]);
  }

  setStartFromCustomer(event: MatButtonToggleChange): void {
    this.startFromCustomer = event.value === 'customer';
  }

  setEndFromCustomer(event: MatButtonToggleChange): void {
    this.endFromCustomer = event.value === 'customer';
  }

  setStartKmFromCustomer(event: MatButtonToggleChange): void {
    this.startKmFromCustomer = event.value === 'customer';
  }

  setEndKmFromCustomer(event: MatButtonToggleChange): void {
    this.endKmFromCustomer = event.value === 'customer';
  }

  durationLabel(): string | null {
    if (!this.start || !this.end || !this.end.isAfter(this.start)) return null;
    const totalMinutes = this.end.diff(this.start, 'minutes');
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h} t ${m.toString().padStart(2, '0')} min`;
  }

  distanceLabel(): string | null {
    if (this.startKm == null || this.endKm == null || this.endKm < this.startKm) return null;
    return `${this.endKm - this.startKm} km`;
  }

  // Nothing here is mandatory — a driver can save just a note, or just one reading, without the
  // rest — so this only ever catches values that are actually self-contradictory once given,
  // never a merely-missing one.
  error(): string | null {
    if (this.start && !this.start.isValid()) return 'Ugyldig dato eller tid for "Start".';
    if (this.end && !this.end.isValid()) return 'Ugyldig dato eller tid for "Slut".';
    if (this.start && this.end && this.end.isBefore(this.start)) return '"Slut" kan ikke være før "Start".';
    if (this.startKm != null && this.endKm != null && this.endKm < this.startKm) {
      return '"Triptæller slut" kan ikke være mindre end "Triptæller start".';
    }
    return null;
  }

  onSubmit(): void {
    if (this.saving()) return;
    if (this.error()) return;
    const report: TripReport = {
      start: this.start,
      startFromCustomer: this.startFromCustomer,
      end: this.end,
      endFromCustomer: this.endFromCustomer,
      startKm: this.startKm,
      startKmFromCustomer: this.startKmFromCustomer,
      endKm: this.endKm,
      endKmFromCustomer: this.endKmFromCustomer,
      note: this.note.trim(),
    };
    void this.writeFeedback.closeDialogOn(this.dialogRef, this.dataStore.setTripReport(this.trip.$key, this.driverKey, report), this.saving);
  }

  deleteReport(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: 'Er du sikker på, at du vil slette denne rapport?',
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        void this.writeFeedback.closeDialogOn(
          this.dialogRef, this.dataStore.deleteTripReport(this.trip.$key, this.driverKey), this.saving, {failureMessage: 'Kunne ikke slette rapporten. Prøv igen.'});
      }
    });
  }
}
