import {ChangeDetectionStrategy, Component, computed, effect, inject, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe, DecimalPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {DateRange, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
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
import {ChipFilterComponent} from '../chip-filter/chip-filter.component';
import {CollapsibleBottomBarComponent} from '../collapsible-bottom-bar/collapsible-bottom-bar.component';
import {FuelReportingComponent} from '../fuel-reporting/fuel-reporting.component';
import {FuelReportFormComponent} from '../fuel-report-form/fuel-report-form.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';
import {PageHeaderService} from '../page-header.service';

type FuelReportRow = FuelReport & {vehicleKey: string; vehicleName: string; driverName: string};

interface VehicleGroup {
  vehicleKey: string;
  vehicleName: string;
  isRutebus: boolean;
  rows: FuelReportRow[];
  /** Computable with at least two readings in the period, or one plus a reading just before it
   * (see beforePeriodReadings) — otherwise there's nothing to take a delta against. */
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
    MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, MatDatepickerModule,
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

  private readonly rawReports = toSignal(
    combineLatest([toObservable(this.vehiclesToQuery), toObservable(this.from), toObservable(this.to)]).pipe(
      switchMap(([vehicles, from, to]) => this.dataStore.getFuelReportsForVehicles(vehicles, from, to)),
    ) as Observable<Array<FuelReport & {vehicleKey: string; vehicleName: string}> | null>,
    {initialValue: null},
  );

  // The reading right before the selected period, per vehicle — a baseline for computing
  // distance when a vehicle has only one reading inside the period itself (see vehicleGroups
  // below), never shown as a row in its own right.
  private readonly beforePeriodReadings = toSignal(
    combineLatest([toObservable(this.vehiclesToQuery), toObservable(this.from)]).pipe(
      switchMap(([vehicles, from]) => vehicles.length
        ? combineLatest(vehicles.map(v => this.dataStore.getLatestFuelReportBefore(v.$key, from).pipe(
            map(r => r ? {vehicleKey: v.$key, odometerKm: r.odometerKm} : null),
          )))
        : of([])),
    ) as Observable<Array<{vehicleKey: string; odometerKm: number} | null> | null>,
    {initialValue: null},
  );

  readonly loadingReports = computed(() => this.rawReports() === null);

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
        const totalLiters = groupRows.reduce((sum, r) => sum + r.liters, 0);
        const vehicleKey = groupRows[0].vehicleKey;
        // Two or more readings in the period already bracket a distance on their own. Exactly
        // one reading can still produce a distance if there's a reading just before the period
        // to diff it against (e.g. refuelling on the 15th with the period starting the same day
        // — the 14th's reading is what makes that first in-period reading meaningful at all).
        // Zero readings never happens here — a vehicle with none wouldn't have a group.
        const beforeOdometer = beforeReadings.find(b => b?.vehicleKey === vehicleKey)?.odometerKm;
        const distanceKm = groupRows.length >= 2
          ? Math.max(...groupRows.map(r => r.odometerKm)) - Math.min(...groupRows.map(r => r.odometerKm))
          : (groupRows.length === 1 && beforeOdometer != null)
            ? Math.abs(groupRows[0].odometerKm - beforeOdometer)
            : null;
        return {
          vehicleKey,
          vehicleName: groupRows[0].vehicleName,
          isRutebus: this.vehicleList().find(v => v.$key === vehicleKey)?.isRutebus ?? false,
          rows: [...groupRows].sort((a, b) => a.date.valueOf() - b.date.valueOf()),
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

  // Same grand total, split by rute/turist so an admin can see each fleet's contribution
  // separately rather than only the combined figure.
  readonly categoryTotals = computed(() => {
    const groups = this.vehicleGroups();
    return {
      rute: summarizeGroups(groups.filter(g => g.isRutebus)),
      turist: summarizeGroups(groups.filter(g => !g.isRutebus)),
    };
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

  // An admin reporting a refuelling isn't reporting their own — the form itself asks which
  // driver it's for (see FuelReportFormComponent.needsDriverPicker) rather than this assuming one.
  startFuelingAsAdmin(): void {
    this.dialog.open(FuelReportFormComponent, SMALL_DIALOG_CONFIG);
  }

  editRow(row: FuelReportRow): void {
    const instance = this.dialog.open(FuelReportFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.vehicleKey = row.vehicleKey;
    instance.record = row;
  }
}
