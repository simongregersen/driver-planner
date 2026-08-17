import {ChangeDetectionStrategy, Component, OnInit, inject, signal} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';
import {firstValueFrom} from 'rxjs';
import moment from 'moment';
import {DataStore} from '../data.service';
import {DateUtility} from '../date-utility';
import {PageHeaderService} from '../page-header.service';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';

// GDPR: trip/customer data isn't kept longer than this many years — a deliberate code change if
// it ever needs to differ, not a free-text field on a destructive admin action.
const TRIP_RETENTION_YEARS = 5;

// Public-date markers exist only so drivers/admins can look back at already-published days —
// nobody legitimately needs to look back this far, so this is pruned separately, and much more
// aggressively, from trips themselves.
const PUBLIC_DATE_RETENTION_YEARS = 1;

// Working-time records are payroll evidence, so they're kept longer than trips: Danish
// bookkeeping rules require payroll documentation to be retained for five years after the end of
// the financial year it belongs to, and this is the data that substantiates it. Kept as its own
// constant rather than sharing TRIP_RETENTION_YEARS because the two are governed by different
// things and shouldn't silently move together.
const CLOCK_RECORD_RETENTION_YEARS = 6;

// Absence/holiday notes name individual employees and have no value once the period they
// describe is well past — the shortest retention here, since nothing depends on them
// historically the way payroll depends on clock records.
const NOTE_RETENTION_YEARS = 2;

// Refuelling records back the fuel-consumption statistics, which are only ever looked at over
// recent periods — but they're also the odometer history, so they're kept a good while longer
// than notes.
const FUEL_REPORT_RETENTION_YEARS = 5;

// Deliberately unreachable from any nav (see app.routes.ts's comment on the /cleanup route) —
// still gated by authGuard/adminGuard like every other admin page, just never linked to.
@Component({
  standalone: true,
  selector: 'app-cleanup',
  templateUrl: './cleanup.component.html',
  styleUrls: ['./cleanup.component.css'],
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CleanupComponent implements OnInit {
  private readonly dataStore = inject(DataStore);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly pageHeader = inject(PageHeaderService);

  readonly tripRetentionYears = TRIP_RETENTION_YEARS;
  readonly publicDateRetentionYears = PUBLIC_DATE_RETENTION_YEARS;
  readonly clockRecordRetentionYears = CLOCK_RECORD_RETENTION_YEARS;
  readonly noteRetentionYears = NOTE_RETENTION_YEARS;
  readonly fuelReportRetentionYears = FUEL_REPORT_RETENTION_YEARS;
  // A signal rather than a plain field: under OnPush, a plain field mutated after an `await`
  // never triggers a re-render (only the synchronous portion of a (click) handler does), so the
  // button would otherwise stay stuck disabled once the async work moves past its first `await`.
  readonly running = signal(false);

  ngOnInit(): void {
    this.pageHeader.set('Oprydning');
  }

  async cleanupOldData(): Promise<void> {
    this.running.set(true);
    try {
      const tripCutoff = this.dateUtility.today().subtract(TRIP_RETENTION_YEARS, 'years');
      const publicCutoff = this.dateUtility.today().subtract(PUBLIC_DATE_RETENTION_YEARS, 'years');
      const clockCutoff = this.dateUtility.today().subtract(CLOCK_RECORD_RETENTION_YEARS, 'years');
      const noteCutoff = this.dateUtility.today().subtract(NOTE_RETENTION_YEARS, 'years');
      const fuelCutoff = this.dateUtility.today().subtract(FUEL_REPORT_RETENTION_YEARS, 'years');

      const [trips, publicDateKeys, clockRecordPaths, noteKeys, fuelReportPaths] = await Promise.all([
        firstValueFrom(this.dataStore.getTripsOlderThan(tripCutoff)),
        firstValueFrom(this.dataStore.getPublicDatesOlderThan(publicCutoff)),
        this.dataStore.getClockRecordPathsOlderThan(clockCutoff),
        this.dataStore.getNoteKeysOlderThan(noteCutoff),
        this.dataStore.getFuelReportPathsOlderThan(fuelCutoff),
      ]);

      if (!trips.length && !publicDateKeys.length && !clockRecordPaths.length && !noteKeys.length && !fuelReportPaths.length) {
        this.snackBar.open('Intet at rydde op i.', 'OK', {duration: 4000});
        return;
      }

      const parts: string[] = [];
      if (trips.length) {
        // Already ordered oldest-first by the query itself (orderByChild('start')) — no need to
        // sort, and no need to convert every matched trip to a Moment just to format these two.
        const oldest = moment(trips[0].start).format('D. MMMM YYYY');
        const newest = moment(trips[trips.length - 1].start).format('D. MMMM YYYY');
        const tripWord = trips.length === 1 ? 'tur' : 'ture';
        parts.push(`${trips.length} ${tripWord} ældre end ${TRIP_RETENTION_YEARS} år (fra ${oldest} til ${newest})`);
      }
      if (publicDateKeys.length) {
        const sortedKeys = [...publicDateKeys].sort();
        const dateWord = publicDateKeys.length === 1 ? 'offentliggjort dato' : 'offentliggjorte datoer';
        parts.push(`${publicDateKeys.length} ${dateWord} ældre end ${PUBLIC_DATE_RETENTION_YEARS} år (fra ${sortedKeys[0]} til ${sortedKeys[sortedKeys.length - 1]})`);
      }
      if (clockRecordPaths.length) {
        const word = clockRecordPaths.length === 1 ? 'arbejdstidsregistrering' : 'arbejdstidsregistreringer';
        parts.push(`${clockRecordPaths.length} ${word} ældre end ${CLOCK_RECORD_RETENTION_YEARS} år`);
      }
      if (noteKeys.length) {
        const word = noteKeys.length === 1 ? 'note' : 'noter';
        parts.push(`${noteKeys.length} ${word} ældre end ${NOTE_RETENTION_YEARS} år`);
      }
      if (fuelReportPaths.length) {
        const word = fuelReportPaths.length === 1 ? 'tankning' : 'tankninger';
        parts.push(`${fuelReportPaths.length} ${word} ældre end ${FUEL_REPORT_RETENTION_YEARS} år`);
      }

      const dialogRef = this.dialog.open(ConfirmDialogComponent, {
        ...CONFIRM_DIALOG_CONFIG,
        data: {
          message: `Slet ${parts.join(' og ')}?\nDette kan ikke fortrydes.`,
          confirmLabel: 'Slet',
          danger: true,
        } as ConfirmDialogData,
      });

      const confirmed = await firstValueFrom(dialogRef.afterClosed());
      if (!confirmed) return;

      await Promise.all([
        this.dataStore.removeTrips(trips.map(t => t.$key)),
        this.dataStore.removePublicDates(publicDateKeys),
        this.dataStore.removeClockRecordPaths(clockRecordPaths),
        this.dataStore.removeNotes(noteKeys),
        this.dataStore.removeFuelReportPaths(fuelReportPaths),
      ]);
      console.log('Cleanup removed:'
        + ` ${trips.length} trips older than ${tripCutoff.format('YYYY-MM-DD')},`
        + ` ${publicDateKeys.length} public-date markers older than ${publicCutoff.format('YYYY-MM-DD')},`
        + ` ${clockRecordPaths.length} clock records older than ${clockCutoff.format('YYYY-MM-DD')},`
        + ` ${noteKeys.length} notes older than ${noteCutoff.format('YYYY-MM-DD')},`
        + ` ${fuelReportPaths.length} fuel reports older than ${fuelCutoff.format('YYYY-MM-DD')}.`);

      const resultParts: string[] = [];
      if (trips.length) resultParts.push(`${trips.length} ${trips.length === 1 ? 'tur' : 'ture'}`);
      if (publicDateKeys.length) {
        resultParts.push(`${publicDateKeys.length} ${publicDateKeys.length === 1 ? 'offentliggjort dato' : 'offentliggjorte datoer'}`);
      }
      if (clockRecordPaths.length) {
        resultParts.push(`${clockRecordPaths.length} ${clockRecordPaths.length === 1 ? 'arbejdstidsregistrering' : 'arbejdstidsregistreringer'}`);
      }
      if (noteKeys.length) resultParts.push(`${noteKeys.length} ${noteKeys.length === 1 ? 'note' : 'noter'}`);
      if (fuelReportPaths.length) {
        resultParts.push(`${fuelReportPaths.length} ${fuelReportPaths.length === 1 ? 'tankning' : 'tankninger'}`);
      }
      this.snackBar.open(`${resultParts.join(' og ')} blev slettet.`, 'OK', {duration: 4000});
    } catch (err) {
      console.error('Cleanup failed', err);
      this.snackBar.open('Der skete en fejl under oprydningen. Prøv igen.', 'OK', {duration: 6000});
    } finally {
      this.running.set(false);
    }
  }
}
