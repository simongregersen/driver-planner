import {ChangeDetectionStrategy, Component, computed, effect, inject, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe, DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {DateRange, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTooltipModule} from '@angular/material/tooltip';
import {combineLatest, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {Moment} from 'moment';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {DateUtility} from '../date-utility';
import {BreakpointService} from '../breakpoint.service';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {FuelReport} from '../fuel-report';
import {TankRefill} from '../tank-refill';
import {ChipFilterComponent} from '../chip-filter/chip-filter.component';
import {CollapsibleBottomBarComponent} from '../collapsible-bottom-bar/collapsible-bottom-bar.component';
import {FuelReportingComponent} from '../fuel-reporting/fuel-reporting.component';
import {FuelReportFormComponent} from '../fuel-report-form/fuel-report-form.component';
import {TankRefillFormComponent} from '../tank-refill-form/tank-refill-form.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';
import {PageHeaderService} from '../page-header.service';

type FuelReportRow = FuelReport & {vehicleKey: string; vehicleName: string; driverName: string};

interface TankRow {
  refill: TankRefill;
  krPerLiter: number | null;
}

interface CategoryCost {
  label: string;
  totalLiters: number;
  /** liters × the period's overall average tank price — a FuelReport itself never records what
   * was paid, only Triptæller/liters. Null when the period's average kr/L (see tankTotal)
   * itself can't be computed. */
  cost: number | null;
}

interface VehicleGroup {
  vehicleKey: string;
  vehicleName: string;
  isRutebus: boolean;
  rows: FuelReportRow[];
  /** The last reading before the period, shown (dimmed, read-only) as the first row whenever
   * this group is expanded — the anchor the first in-period row's own delta is computed
   * against, so the arithmetic behind distanceKm below isn't just taken on faith. Null when
   * there's no reading before the period to anchor against at all. */
  baselineRow: FuelReportRow | null;
  /** Computable with at least two readings in the period, or one plus baselineRow — otherwise
   * there's nothing to take a delta against. */
  distanceKm: number | null;
  totalLiters: number;
  kmPerLiter: number | null;
}

interface CategoryTotal {
  totalDistance: number;
  totalLiters: number;
  kmPerLiter: number | null;
}

function summarizeGroups(groups: VehicleGroup[]): CategoryTotal {
  const totalDistance = groups.reduce((sum, g) => sum + (g.distanceKm ?? 0), 0);
  const totalLiters = groups.reduce((sum, g) => sum + g.totalLiters, 0);
  const hasDistance = groups.some(g => g.distanceKm != null);
  return {
    totalDistance,
    totalLiters,
    kmPerLiter: (hasDistance && totalDistance > 0 && totalLiters > 0) ? totalDistance / totalLiters : null,
  };
}

// One routed page shared by both roles, following TimeReportComponent's precedent: an admin
// gets a date-range + vehicle filter and an aggregate report across vehicles/drivers; a plain
// driver gets the "Start tankning" action and their own recent refuellings. The two branches
// show genuinely different content (there's no single driver whose report an admin "picks" here,
// unlike TimeReportComponent) but share the one route/component per the same convention.
@Component({
  standalone: true,
  selector: 'app-fuel-tracking',
  templateUrl: './fuel-tracking.component.html',
  styleUrls: ['./fuel-tracking.component.css'],
  imports: [
    AsyncPipe, DatePipe, DecimalPipe,
    MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressSpinnerModule, MatSlideToggleModule, MatTooltipModule, MatDatepickerModule,
    ChipFilterComponent, CollapsibleBottomBarComponent, FuelReportingComponent,
  ],
  providers: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuelTrackingComponent {
  readonly userService = inject(UserService);
  readonly breakpoints = inject(BreakpointService);
  private readonly dataStore = inject(DataStore);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  private readonly pageHeader = inject(PageHeaderService);
  private readonly datePipe = inject(DatePipe);

  readonly recordsWindowStart = this.dateUtility.today().subtract(14, 'days');

  // Admin filters — defaults to the current calendar month.
  readonly from = signal<Moment>(this.dateUtility.today().startOf('month'));
  readonly to = signal<Moment>(this.dateUtility.today().endOf('month'));
  readonly selectedVehicleKeys = signal<string[]>([]);
  readonly minDate = this.dateUtility.minDate(5);

  // Two-click range picking on the inline calendar, mirroring PeriodPlansComponent: the first
  // click starts a new range (highlighted as from→open-ended); a second click after that date
  // completes it and triggers the report fetch via from/to above; a click that isn't after the
  // pending start instead restarts the range from that new date.
  private pendingFrom: Moment | null = null;
  selectedRange = new DateRange<Moment>(this.from(), this.to());

  readonly dateClass: MatCalendarCellClassFunction<Moment> = date =>
    this.dateUtility.isPast(date) ? 'past-day' : '';

  private readonly isAdmin = toSignal(this.userService.isAdmin$, {initialValue: false});
  // An admin can also have their own driver profile (someone who both manages and occasionally
  // drives) — used only to default startFuelingAsAdmin's driver picker to themselves; null for
  // an admin with no linked profile, which just leaves that picker unset as before.
  private readonly ownDriverProfile = toSignal(this.userService.driverProfile$, {initialValue: null as Driver | null});

  private readonly vehicleList = toSignal(this.dataStore.getAllVehicles(), {initialValue: [] as Vehicle[]});
  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});
  readonly vehicleOptions = computed(() => this.vehicleList().map(v => ({id: v.$key, name: v.displayName})));

  // Empty selection means "every vehicle" — the query is scoped to exactly what's asked for,
  // rather than fetching everything and filtering client-side.
  private readonly vehiclesToQuery = computed(() => {
    const selected = this.selectedVehicleKeys();
    const all = this.vehicleList();
    return selected.length ? all.filter(v => selected.includes(v.$key)) : all;
  });

  // getFuelReports/getLatestFuelReportBefore below are one-time reads, not live listeners (see
  // their own doc comments on why) — so nothing re-fetches on its own after a report is added,
  // edited, or toggled. Bumping this is what makes those actions (see setExcludedFromStatistics,
  // editRow, startFuelingAsAdmin) actually show up here afterwards.
  private readonly refreshTrigger = signal(0);

  private readonly rawReports = toSignal(
    combineLatest([toObservable(this.vehiclesToQuery), toObservable(this.from), toObservable(this.to), toObservable(this.refreshTrigger)]).pipe(
      switchMap(([vehicles, from, to]) => this.dataStore.getFuelReportsForVehicles(vehicles, from, to)),
    ) as Observable<(FuelReport & {vehicleKey: string; vehicleName: string})[] | null>,
    {initialValue: null},
  );

  // The reading right before the selected period, per vehicle — a baseline for computing
  // distance when a vehicle has only one reading inside the period itself (see vehicleGroups
  // below). Kept as the full report (not just its odometerKm) so it can also be shown as
  // context — see VehicleGroup.baselineRow — rather than only folded invisibly into the math.
  private readonly beforePeriodReadings = toSignal(
    combineLatest([toObservable(this.vehiclesToQuery), toObservable(this.from), toObservable(this.refreshTrigger)]).pipe(
      switchMap(([vehicles, from]) => vehicles.length
        ? combineLatest(vehicles.map(v => this.dataStore.getLatestFuelReportBefore(v.$key, from).pipe(
            map(r => r ? {vehicleKey: v.$key, vehicleName: v.displayName, report: r} : null),
          )))
        : of([])),
    ) as Observable<({vehicleKey: string; vehicleName: string; report: FuelReport} | null)[] | null>,
    {initialValue: null},
  );

  readonly loadingReports = computed(() => this.rawReports() === null);

  // Admin-only data (see database.rules.json) — gated on isAdmin() so a driver's session never
  // even issues the request, which would otherwise fail as permission-denied.
  private readonly tankRefills = toSignal(
    combineLatest([toObservable(this.isAdmin), toObservable(this.from), toObservable(this.to), toObservable(this.refreshTrigger)]).pipe(
      switchMap(([isAdmin, from, to]) => isAdmin ? this.dataStore.getTankRefills(from, to) : of([]))
    ) as Observable<TankRefill[]>,
    {initialValue: [] as TankRefill[]},
  );

  readonly tankRows = computed<TankRow[]>(() =>
    [...this.tankRefills()]
      .sort((a, b) => a.date.valueOf() - b.date.valueOf())
      .map(refill => ({refill, krPerLiter: refill.liters > 0 ? refill.price / refill.liters : null}))
  );

  readonly tankTotal = computed(() => {
    const rows = this.tankRows();
    const totalLiters = rows.reduce((sum, r) => sum + r.refill.liters, 0);
    const totalPrice = rows.reduce((sum, r) => sum + r.refill.price, 0);
    return {
      totalLiters,
      totalPrice,
      krPerLiter: totalLiters > 0 ? totalPrice / totalLiters : null,
    };
  });

  // Collapsed by default (see the component's own doc comment) — an admin unfolds only the
  // vehicles they actually want the per-report breakdown for.
  private readonly expandedVehicleKeys = signal<ReadonlySet<string>>(new Set());

  isExpanded(vehicleKey: string): boolean {
    return this.expandedVehicleKeys().has(vehicleKey);
  }

  toggleExpanded(vehicleKey: string): void {
    this.expandedVehicleKeys.update(keys => {
      const next = new Set(keys);
      if (next.has(vehicleKey)) next.delete(vehicleKey); else next.add(vehicleKey);
      return next;
    });
  }

  readonly vehicleGroups = computed<VehicleGroup[]>(() => {
    const drivers = this.driverList();
    const beforeReadings = this.beforePeriodReadings() ?? [];
    const byVehicle = new Map<string, FuelReportRow[]>();
    for (const r of this.rawReports() ?? []) {
      const row: FuelReportRow = {...r, driverName: drivers.find(d => d.$key === r.driverKey)?.displayName ?? 'Ukendt chauffør'};
      const rows = byVehicle.get(r.vehicleKey);
      if (rows) rows.push(row); else byVehicle.set(r.vehicleKey, [row]);
    }
    return Array.from(byVehicle.values())
      .map(groupRows => {
        const vehicleKey = groupRows[0].vehicleKey;
        const sortedRows = [...groupRows].sort((a, b) => a.date.valueOf() - b.date.valueOf());
        const beforeReading = beforeReadings.find(b => b?.vehicleKey === vehicleKey);
        const beforeOdometer = beforeReading?.report.odometerKm;
        const baselineRow: FuelReportRow | null = beforeReading
          ? {...beforeReading.report, vehicleKey, vehicleName: beforeReading.vehicleName, driverName: drivers.find(d => d.$key === beforeReading.report.driverKey)?.displayName ?? 'Ukendt chauffør'}
          : null;

        // An excluded report's liters never count...
        const totalLiters = sortedRows.filter(r => !r.excludeFromStatistics).reduce((sum, r) => sum + r.liters, 0);

        // ...and neither does the distance it represents — the km since whichever reading came
        // right before it (an earlier in-period row, or the last reading before the period for
        // the first row). Walking the chain and summing only the non-excluded deltas is
        // equivalent to the old max(odometerKm) - min(odometerKm) when nothing is excluded (it
        // telescopes to the same total), but lets one excluded report's delta drop out of the
        // total while its own reading still anchors the next report's delta.
        let previousOdometer = beforeOdometer;
        let distanceKm: number | null = null;
        for (const row of sortedRows) {
          if (previousOdometer != null && !row.excludeFromStatistics) {
            distanceKm = (distanceKm ?? 0) + (row.odometerKm - previousOdometer);
          }
          previousOdometer = row.odometerKm;
        }

        return {
          vehicleKey,
          vehicleName: groupRows[0].vehicleName,
          isRutebus: this.vehicleList().find(v => v.$key === vehicleKey)?.isRutebus ?? false,
          rows: sortedRows,
          baselineRow,
          distanceKm,
          totalLiters,
          kmPerLiter: (distanceKm != null && totalLiters > 0) ? distanceKm / totalLiters : null,
        };
      })
      .sort((a, b) => a.vehicleName.localeCompare(b.vehicleName, undefined, {numeric: true}));
  });

  // Vehicles with only one reading in the period don't contribute a distance (nothing to take a
  // delta against) — their fuel still counts toward the total liters, just not the total km.
  // kmPerLiter stays null (not a misleading "0.0") when not a single vehicle had enough readings
  // to contribute a distance at all, same as a single vehicle group's own kmPerLiter above.
  readonly grandTotal = computed(() => summarizeGroups(this.vehicleGroups()));

  // One overview table per category (see the template) rather than a single mixed table with a
  // "Heraf ..." total line underneath — each category's own stats table shows its own total
  // directly. isRutebus is still the underlying Vehicle field (see vehicle.ts); only the
  // user-facing label changed from Rutebus/Turistbus to Special/Turist.
  readonly categoryGroups = computed(() => {
    const groups = this.vehicleGroups();
    return [
      {label: 'Special', groups: groups.filter(g => g.isRutebus), total: summarizeGroups(groups.filter(g => g.isRutebus))},
      {label: 'Turist', groups: groups.filter(g => !g.isRutebus), total: summarizeGroups(groups.filter(g => !g.isRutebus))},
    ];
  });

  // Fuel cost per vehicle type (Special/Turist) — FuelReport never records a price of its own
  // (only Triptæller/liters), so this multiplies each category's own liters by the one price we
  // do have: the period's overall average kr/L, from the Tank section's own tankTotal above.
  readonly categoryCosts = computed<CategoryCost[]>(() =>
    this.categoryGroups().map(c => {
      const avgKrPerLiter = this.tankTotal().krPerLiter;
      return {
        label: c.label,
        totalLiters: c.total.totalLiters,
        cost: avgKrPerLiter != null ? c.total.totalLiters * avgKrPerLiter : null,
      };
    })
  );

  // Sum of categoryCosts's own per-category costs — equivalent to grandTotal.totalLiters ×
  // avgKrPerLiter, just derived from the same per-category figures shown above it rather than
  // recomputed independently.
  readonly totalCost = computed(() => {
    const avgKrPerLiter = this.tankTotal().krPerLiter;
    return avgKrPerLiter != null ? this.grandTotal().totalLiters * avgKrPerLiter : null;
  });

  // The range shown in both headers below: an admin's own selected period, or — a driver has no
  // period to pick — the same rolling window their own recent-refuellings list already fetches
  // (see recordsWindowStart above) through today.
  readonly headerFrom = computed(() => this.isAdmin() ? this.from() : this.recordsWindowStart);
  readonly headerTo = computed(() => this.isAdmin() ? this.to() : this.dateUtility.today());

  private readonly headerEffect = effect(() => {
    const from = this.datePipe.transform(this.headerFrom().toDate(), 'd. MMM');
    const to = this.datePipe.transform(this.headerTo().toDate(), 'd. MMM y');
    this.pageHeader.set('Brændstof', `${from} – ${to}`);
  });

  onDateChange(date: Moment | null): void {
    if (!date) return;
    if (!this.pendingFrom) {
      this.pendingFrom = date;
      this.selectedRange = new DateRange<Moment>(date, null);
      return;
    }
    if (date.isAfter(this.pendingFrom)) {
      const from = this.pendingFrom;
      this.from.set(from);
      this.to.set(date);
      this.selectedRange = new DateRange<Moment>(from, date);
      this.pendingFrom = null;
    } else {
      this.pendingFrom = date;
      this.selectedRange = new DateRange<Moment>(date, null);
    }
  }

  // The compact range field (narrow-sidebar and mobile-bar view — see the component's @if on
  // .compact-date-field) sets each end directly rather than through the inline calendar's
  // two-click sequence above; keeping selectedRange in step here too means switching back to a
  // wide viewport shows the inline calendar with whatever range was picked on the compact one.
  setFrom(value: Moment | null): void {
    if (!value) return;
    this.from.set(value);
    this.selectedRange = new DateRange<Moment>(value, this.to());
    this.pendingFrom = null;
  }

  setTo(value: Moment | null): void {
    if (!value) return;
    this.to.set(value);
    this.selectedRange = new DateRange<Moment>(this.from(), value);
    this.pendingFrom = null;
  }

  startFueling(driverKey: string): void {
    const instance = this.dialog.open(FuelReportFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.driverKey = driverKey;
  }

  // The form itself still asks which driver it's for (see FuelReportFormComponent.
  // needsDriverPicker) rather than this assuming one outright — an admin reporting on someone
  // else's behalf is a real case too — but it's pre-selected to the admin's own driver profile,
  // if they have one, since reporting their own refuelling is the far more common case.
  startFuelingAsAdmin(): void {
    const dialogRef = this.dialog.open(FuelReportFormComponent, SMALL_DIALOG_CONFIG);
    dialogRef.componentInstance.defaultDriverKey = this.ownDriverProfile()?.$key;
    dialogRef.afterClosed().subscribe(() => this.refreshTrigger.update(n => n + 1));
  }

  editRow(row: FuelReportRow): void {
    const dialogRef = this.dialog.open(FuelReportFormComponent, SMALL_DIALOG_CONFIG);
    const instance = dialogRef.componentInstance;
    instance.mode = 'edit';
    instance.vehicleKey = row.vehicleKey;
    instance.record = row;
    dialogRef.afterClosed().subscribe(() => this.refreshTrigger.update(n => n + 1));
  }

  // Admin-only control, only ever reachable from this component's own admin table — see
  // DataStore.setFuelReportExcluded and database.rules.json's .validate rule on the field.
  setExcludedFromStatistics(row: FuelReportRow, excluded: boolean): void {
    this.dataStore.setFuelReportExcluded(row.vehicleKey, row, excluded)
      .then(() => this.refreshTrigger.update(n => n + 1));
  }

  addToTank(): void {
    const dialogRef = this.dialog.open(TankRefillFormComponent, SMALL_DIALOG_CONFIG);
    dialogRef.afterClosed().subscribe(() => this.refreshTrigger.update(n => n + 1));
  }

  editTankRefill(refill: TankRefill): void {
    const dialogRef = this.dialog.open(TankRefillFormComponent, SMALL_DIALOG_CONFIG);
    const instance = dialogRef.componentInstance;
    instance.mode = 'edit';
    instance.record = refill;
    dialogRef.afterClosed().subscribe(() => this.refreshTrigger.update(n => n + 1));
  }
}
