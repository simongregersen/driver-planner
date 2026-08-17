import {ChangeDetectionStrategy, Component, computed, inject, input, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe, DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {combineLatest, Observable} from 'rxjs';
import {switchMap} from 'rxjs/operators';
import moment, {Moment} from 'moment';
import {FuelReport} from '../fuel-report';
import {DataStore} from '../data.service';
import {FuelReportFormComponent} from '../fuel-report-form/fuel-report-form.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';

type FuelReportRow = FuelReport & {vehicleKey: string; vehicleName: string};

// The signed-in driver's own recent refuellings across every vehicle — purely presentational,
// like TimeReportingComponent. Fetches across *all* vehicles (fuelReports grants container-level
// read to any driver/admin — see database.rules.json's comment on why a per-record read rule
// can't filter a list query) and then filters down to this driver's own reports client-side.
@Component({
  standalone: true,
  selector: 'app-fuel-reporting',
  templateUrl: './fuel-reporting.component.html',
  styleUrls: ['./fuel-reporting.component.css'],
  imports: [DatePipe, DecimalPipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuelReportingComponent {
  driverKey = input.required<string>();
  from = input.required<Moment>();
  to = input<Moment | undefined>(undefined);
  limit = input<number | undefined>(undefined);
  /** Whether "Ingen tankninger." should be centred in the visible page rather than sitting just
   * under the "Start tankning" button — see .empty-state-centered in styles.css. */
  centerEmptyState = input(false);

  private readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);

  private readonly rawRecords = toSignal(
    combineLatest([this.dataStore.getAllVehicles(), toObservable(this.from), toObservable(this.to)]).pipe(
      switchMap(([vehicles, from, to]) => this.dataStore.getFuelReportsForVehicles(vehicles, from, to)),
    ) as Observable<FuelReportRow[] | null>,
    {initialValue: null},
  );

  readonly showRecentWeek = signal(false);

  readonly loading = computed(() => this.rawRecords() === null);
  // Newest → oldest — unlike the admin report (which stays oldest-first), this driver-facing
  // table reads top-to-bottom as "most recent refuelling first".
  readonly sortedRecords = computed(() =>
    (this.rawRecords() ?? [])
      .filter(r => r.driverKey === this.driverKey())
      .sort((a, b) => b.date.valueOf() - a.date.valueOf())
  );

  readonly visibleRecords = computed(() => {
    const all = this.sortedRecords();
    if (this.showRecentWeek()) {
      const cutoff = moment().subtract(7, 'days');
      return all.filter(r => r.date.isAfter(cutoff));
    }
    // sortedRecords is newest-first, so the most recent `limit` records are the first `limit`
    // entries.
    const limit = this.limit();
    return limit ? all.slice(0, limit) : all;
  });

  // Once expanded, stays capped at the last 7 days rather than the whole (potentially much
  // longer) window the caller fetches — "see more" isn't "see everything".
  readonly hasMore = computed(() => {
    const limit = this.limit();
    return !!limit && !this.showRecentWeek() && this.sortedRecords().length > limit;
  });

  showRecentWeekRecords(): void {
    this.showRecentWeek.set(true);
  }

  collapseRecords(): void {
    this.showRecentWeek.set(false);
  }

  editRecord(record: FuelReportRow): void {
    const instance = this.dialog.open(FuelReportFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.vehicleKey = record.vehicleKey;
    instance.record = record;
  }
}
