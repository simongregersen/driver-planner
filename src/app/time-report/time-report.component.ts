import {ChangeDetectionStrategy, Component, computed, effect, inject, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {combineLatest, Observable, of} from 'rxjs';
import {switchMap} from 'rxjs/operators';
import moment from 'moment';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {Driver} from '../driver';
import {ClockRecord} from '../clock-record';
import {WriteFeedbackService} from '../write-feedback.service';
import {DIALOG_CONFIG} from '../dialog-config';
import {PageHeaderService} from '../page-header.service';
import {PayPeriodReportComponent} from '../pay-period-report/pay-period-report.component';
import {PayPeriodDialogComponent} from '../pay-period-dialog/pay-period-dialog.component';
import {
  clockRecordTotals,
  formatDogn,
  formatDuration,
  PayPeriod,
  payPeriodFor,
  payPeriodKeyOf,
  recentPayPeriods,
  shiftPayPeriod,
} from '../pay-period';

/** How many pay periods the admin overview shows at once — four months, which is enough to watch
 * a driver on deferred payment accumulate unsettled periods rather than only seeing the most
 * recent of them.
 *
 * A period column is a fixed 104px (see .overview-table in the CSS), so this is a straight trade
 * of width for history: eight columns and the name column need about 990px, which a desktop has
 * beside the page's 300px sidebar. A narrower screen scrolls the table sideways rather than
 * dropping columns — a payroll matrix with periods missing from it is worse than one you have to
 * scroll. */
const PAY_PERIOD_COLUMNS = 8;

interface PeriodCell {
  period: PayPeriod;
  hoursLabel: string;
  dognLabel: string | null;
  isEmpty: boolean;
  paid: boolean;
}

interface OverviewRow {
  driver: Driver;
  cells: PeriodCell[];
}

// One routed page shared by both roles, as it has always been — but the two branches now show
// genuinely different things, following FuelTrackingComponent's own reading of this convention.
//
// A driver gets their own timesheet for one period at a time, unchanged: the period navigation
// and PayPeriodReportComponent, which is the whole of what used to be inlined here.
//
// An admin gets the payroll overview instead of the driver-picker-plus-one-timesheet this used
// to be: every driver as a row, the last PAY_PERIOD_COLUMNS periods as columns, each cell the
// period's hours and døgn, and a green check on the periods marked Udbetalt. Clicking a cell
// opens that driver's period in a dialog — the same component the driver sees, editable. The
// question payroll actually asks ("who still needs paying?") is not one about a single driver,
// which is why picking one at a time was the wrong default here.
@Component({
  standalone: true,
  selector: 'app-time-report',
  templateUrl: './time-report.component.html',
  styleUrls: ['./time-report.component.css'],
  imports: [
    DatePipe,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule,
    PayPeriodReportComponent,
  ],
  providers: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeReportComponent {
  readonly userService = inject(UserService);
  private readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);
  private readonly writeFeedback = inject(WriteFeedbackService);
  private readonly pageHeader = inject(PageHeaderService);
  private readonly datePipe = inject(DatePipe);

  readonly isAdmin = toSignal(this.userService.isAdmin$, {initialValue: false});
  private readonly ownDriver = toSignal(this.userService.driverProfile$, {initialValue: null as Driver | null});

  /** The period the page is on: the driver's single timesheet, and the newest (rightmost) column
   * of the admin's window. */
  readonly period = signal<PayPeriod>(payPeriodFor(moment()));

  /** The admin's columns, oldest first. */
  readonly periods = computed(() => recentPayPeriods(PAY_PERIOD_COLUMNS, this.period()));

  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});

  // Admin-only data (see database.rules.json) — gated on isAdmin so a driver's session never
  // issues either request, which would fail as permission-denied.
  //
  // Queried for every driver, deleted ones included: whether a departed driver still belongs on
  // the table depends on whether they have hours in the window, which is only knowable by asking.
  // That costs one extra (empty) range query per driver who has ever left, which is a handful
  // over the life of a company — and the alternative is a row for a deleted driver showing an
  // Udbetalt mark above no hours at all.
  private readonly windowRecords = toSignal(
    combineLatest([toObservable(this.isAdmin), toObservable(this.driverList), toObservable(this.periods)]).pipe(
      switchMap(([isAdmin, drivers, periods]) => isAdmin && drivers.length
        ? this.dataStore.getClockRecordsForDrivers(drivers, periods[0].start, periods.at(-1)!.end)
        : of(null)),
    ) as Observable<(ClockRecord & {driverKey: string})[] | null>,
    {initialValue: null},
  );

  private readonly paidPeriods = toSignal(
    toObservable(this.isAdmin).pipe(switchMap(isAdmin => isAdmin ? this.dataStore.getPaidPeriods() : of([]))),
    {initialValue: [] as string[]},
  );

  readonly loadingOverview = computed(() => this.isAdmin() && this.windowRecords() === null);

  readonly overviewRows = computed<OverviewRow[]>(() => {
    // Empty rather than "every driver with empty cells" for a non-admin: the overview is fed by
    // two admin-only reads that a driver's session never issues, so there is no data behind these
    // rows and nothing renders them either.
    if (!this.isAdmin()) return [];
    const records = this.windowRecords() ?? [];
    const periods = this.periods();
    const paid = new Set(this.paidPeriods());

    // Keyed '<driverKey>/<periodKey>', bucketed by where each shift ended (payPeriodKeyOf) — a
    // shift that runs past the end of a period is paid out with the period it finished in, the
    // same rule the day-by-day view uses to file it under the day it ended.
    const byCell = new Map<string, ClockRecord[]>();
    for (const record of records) {
      const key = `${record.driverKey}/${payPeriodKeyOf(record)}`;
      byCell.set(key, [...(byCell.get(key) ?? []), record]);
    }

    return this.overviewDrivers(records, paid).map(driver => ({
      driver,
      cells: periods.map(period => {
        const cellKey = `${driver.$key}/${period.key}`;
        const totals = clockRecordTotals(byCell.get(cellKey) ?? []);
        const isEmpty = totals.minutes === 0 && totals.dognCount === 0;
        return {
          period,
          hoursLabel: isEmpty ? '—' : formatDuration(totals.minutes),
          dognLabel: totals.dognCount > 0 ? formatDogn(totals.dognCount) : null,
          isEmpty,
          paid: paid.has(cellKey),
        };
      }),
    }));
  });

  /** Active drivers, plus any deleted one still carrying hours or an Udbetalt mark inside the
   * window. Filtering deleted drivers out wholesale would take an unsettled period off the
   * payroll screen the moment someone left — which is exactly when it still has to be paid, and
   * there is no per-driver view left to reach it from. They drop off on their own once the
   * window has moved past their last records.
   *
   * External drivers are dropped outright, records or not: this table tracks hours this company
   * owes, and an external driver's hours are never that, past or present. */
  private overviewDrivers(records: (ClockRecord & {driverKey: string})[], paid: Set<string>): Driver[] {
    const periodKeys = new Set(this.periods().map(p => p.key));
    const withRecords = new Set(records.map(r => r.driverKey));
    const withMark = new Set(
      [...paid].map(k => k.split('/')).filter(([, periodKey]) => periodKeys.has(periodKey)).map(([driverKey]) => driverKey)
    );
    return this.driverList().filter(d => !d.external && (!d.deleted || withRecords.has(d.$key) || withMark.has(d.$key)));
  }

  /** An admin's header covers the whole visible window; a driver's, their single period. */
  readonly headerFrom = computed(() => this.isAdmin() ? this.periods()[0].start : this.period().start);

  readonly driverKey = computed(() => this.ownDriver()?.$key ?? null);

  constructor() {
    effect(() => {
      const from = this.datePipe.transform(this.headerFrom().toDate(), 'd. MMM');
      const to = this.datePipe.transform(this.period().end.toDate(), 'd. MMM y');
      this.pageHeader.set('Timesedler', `${from} – ${to}`);
    });
  }

  previousPeriod() {
    this.period.update(p => shiftPayPeriod(p, this.isAdmin() ? -PAY_PERIOD_COLUMNS : -1));
  }

  nextPeriod() {
    this.period.update(p => shiftPayPeriod(p, this.isAdmin() ? PAY_PERIOD_COLUMNS : 1));
  }

  goToCurrentPeriod() {
    this.period.set(payPeriodFor(moment()));
  }

  isCurrentPeriod(): boolean {
    return this.period().key === payPeriodFor(moment()).key;
  }

  openPeriod(driver: Driver, cell: PeriodCell) {
    const instance = this.dialog.open(PayPeriodDialogComponent, DIALOG_CONFIG).componentInstance;
    instance.driverKey = driver.$key;
    instance.driverName = driver.displayName;
    instance.period = cell.period;
    instance.paid.set(cell.paid);
  }

  // No confirmation: marking is one click, instantly visible, and reversible by the same click —
  // an admin working through a fortnight marks a column of these in a sitting. The write still
  // goes through WriteFeedbackService so a rejected or queued one is reported rather than lost;
  // the cell itself updates from the live /paidPeriods listener, not optimistically.
  togglePaid(driver: Driver, cell: PeriodCell) {
    void this.writeFeedback.run(this.dataStore.setPeriodPaid(driver.$key, cell.period.key, !cell.paid), {
      failureMessage: 'Kunne ikke gemme udbetalt-markeringen. Prøv igen.',
    });
  }

  paidLabel(driver: Driver, cell: PeriodCell): string {
    return `${cell.paid ? 'Udbetalt' : 'Ikke udbetalt'}: ${driver.displayName}, ${cell.period.label}`;
  }

  // Unspaced around the dash, unlike the date ranges in the page headers: this one sets the width
  // of a column that repeats six times across, and it is read as one span rather than as two
  // dates to compare.
  periodDates(period: PayPeriod): string {
    return `${this.datePipe.transform(period.start.toDate(), 'd/M')}–${this.datePipe.transform(period.end.toDate(), 'd/M')}`;
  }
}
