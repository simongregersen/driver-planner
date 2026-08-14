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

      const [trips, publicDateKeys] = await Promise.all([
        firstValueFrom(this.dataStore.getTripsOlderThan(tripCutoff)),
        firstValueFrom(this.dataStore.getPublicDatesOlderThan(publicCutoff)),
      ]);

      if (!trips.length && !publicDateKeys.length) {
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
      ]);
      console.log(`Cleanup: removed ${trips.length} trips older than ${tripCutoff.format('YYYY-MM-DD')}`
        + ` and ${publicDateKeys.length} public-date markers older than ${publicCutoff.format('YYYY-MM-DD')}.`);

      const resultParts: string[] = [];
      if (trips.length) resultParts.push(`${trips.length} ${trips.length === 1 ? 'tur' : 'ture'}`);
      if (publicDateKeys.length) {
        resultParts.push(`${publicDateKeys.length} ${publicDateKeys.length === 1 ? 'offentliggjort dato' : 'offentliggjorte datoer'}`);
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
