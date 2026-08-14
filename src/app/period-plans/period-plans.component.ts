import {ChangeDetectionStrategy, Component, computed, inject, OnInit, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {DateRange, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {Moment} from 'moment';
import {Observable} from 'rxjs';
import {DateUtility} from '../date-utility';
import {DataStore} from '../data.service';
import {NewTrip, Trip} from '../trip';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {Utility} from '../utility';
import {TripFormComponent} from '../trip-form/trip-form.component';
import {TripsComponent} from '../trips/trips.component';
import {ChipFilterComponent} from '../chip-filter/chip-filter.component';
import {CollapsibleBottomBarComponent} from '../collapsible-bottom-bar/collapsible-bottom-bar.component';
import {BreakpointService} from '../breakpoint.service';
import {SelectOption} from '../select-option';
import {PageHeaderService} from '../page-header.service';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG} from '../dialog-config';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';

@Component({
  standalone: true,
  selector: 'app-driver-plans',
  templateUrl: './period-plans.component.html',
  styleUrls: ['./period-plans.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatButtonToggleModule, MatDatepickerModule, MatFormFieldModule,
    TripsComponent, ChipFilterComponent, CollapsibleBottomBarComponent,
  ],
  providers: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodPlansComponent implements OnInit {
  readonly dateUtility = inject(DateUtility);
  readonly dataStore = inject(DataStore);
  readonly breakpoints = inject(BreakpointService);
  private readonly dialog = inject(MatDialog);
  private readonly pageHeader = inject(PageHeaderService);
  private readonly datePipe = inject(DatePipe);

  from: Moment | null = null;
  to: Moment | null = null;
  range!: Moment[];
  trips$!: Observable<Trip[]>;
  readonly minDate = this.dateUtility.minDate(5);

  // The calendar renders the from/to highlight itself once it is handed a DateRange.
  selectedRange = new DateRange<Moment>(null, null);

  readonly dateClass: MatCalendarCellClassFunction<Moment> = date =>
    this.dateUtility.isPast(date) ? 'past-day' : '';

  readonly selectedDriverKeys = signal<string[]>([]);
  readonly selectedVehicleKeys = signal<string[]>([]);
  readonly selectedLabelKeys = signal<string[]>([]);
  readonly showOfficeNotes = signal(false);
  readonly showDriverNotes = signal(false);
  readonly showLabels = signal(false);

  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});
  private readonly vehicleList = toSignal(this.dataStore.getAllVehicles(), {initialValue: [] as Vehicle[]});
  readonly driverOptions = computed(() => this.driverList().map(d => ({id: d.$key, name: d.displayName})));
  readonly vehicleOptions = computed(() => this.vehicleList().map(v => ({id: v.$key, name: v.displayName})));
  readonly selectedDriverNames = computed(() =>
    this.driverOptions().filter(o => this.selectedDriverKeys().includes(o.id)).map(o => o.name).join(', ')
  );
  readonly selectedVehicleNames = computed(() =>
    this.vehicleOptions().filter(o => this.selectedVehicleKeys().includes(o.id)).map(o => o.name).join(', ')
  );

  ngOnInit(): void {
    this.from = this.dateUtility.today();
    this.to = this.dateUtility.addDays(this.from, 6);
    this.updateRange();
    this.fetchTrips();
  }

  onDateChange(date: Moment | null) {
    if (!date) return;

    if (!this.from && !this.to) {
      this.from = date;
    } else if (this.from && !this.to && this.dateUtility.after(date, this.from)) {
      this.to = date;
      this.fetchTrips();
    } else {
      this.to = null;
      this.from = date;
    }
    this.updateRange();
  }

  // The compact range field (mobile collapsed bar — see .period-picker-row) sets each end
  // directly via its own two inputs, rather than through the inline calendar's two-click
  // sequence above.
  setFrom(date: Moment | null): void {
    if (!date) return;
    this.from = date;
    this.updateRange();
    this.fetchTrips();
  }

  setTo(date: Moment | null): void {
    if (!date) return;
    this.to = date;
    this.updateRange();
    this.fetchTrips();
  }

  removeTrip(trip: Trip) {
    this.dataStore.removeTrip(trip);
  }

  removeDriverFromTrip({trip, driverKey}: {trip: Trip; driverKey: string}) {
    const name = this.driverList().find(d => d.$key === driverKey)?.displayName ?? 'chaufføren';
    this.confirmRemoval(`Er du sikker på, at du vil fjerne ${name} fra turen?`, () =>
      this.dataStore.updateTrip(trip, {drivers: trip.drivers.filter(k => k !== driverKey)}));
  }

  removeVehicleFromTrip({trip, vehicleKey}: {trip: Trip; vehicleKey: string}) {
    const name = this.vehicleList().find(v => v.$key === vehicleKey)?.displayName ?? 'køretøjet';
    this.confirmRemoval(`Er du sikker på, at du vil fjerne ${name} fra turen?`, () =>
      this.dataStore.updateTrip(trip, {vehicles: trip.vehicles.filter(k => k !== vehicleKey)}));
  }

  // Chip removal happens right next to the row-click-to-edit target, and on a phone screen
  // it's easy to hit by mistake — this catches that before it silently changes the trip.
  private confirmRemoval(message: string, onConfirm: () => void): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {message, confirmLabel: 'Fjern', danger: true} as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) onConfirm();
    });
  }

  edit(trip: Trip) {
    const instance = this.dialog.open(TripFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.trip = trip;
    instance.save.subscribe((updates: NewTrip) => this.dataStore.updateTrip(trip, updates));
    instance.remove.subscribe(() => this.removeTrip(trip));
  }

  fetchTrips(): void {
    this.range = this.dateUtility.range(this.from!, this.to);
    this.trips$ = this.dataStore.getTrips(this.from!, this.to!);
  }

  // Overlap, not just "starts on this date" — a multi-day trip should show up on every day it
  // spans, not only the one it started on.
  filterByDate(trips: Trip[], date: Moment): Trip[] {
    if (!trips || !trips.length) return [];

    const start = this.dateUtility.toMoment(date)!;
    const end = this.dateUtility.toMoment(this.dateUtility.addDays(date, 1))!;
    return trips.filter(t => Utility.tripOverlaps(t, start, end));
  }

  filterTrips(trips: Trip[] | null): Trip[] {
    if (!trips) return [];
    const driverKeys = this.selectedDriverKeys();
    const vehicleKeys = this.selectedVehicleKeys();
    const labelKeys = this.selectedLabelKeys();
    return trips.filter(t =>
      (driverKeys.length === 0 || (t.drivers ?? []).some(k => driverKeys.includes(k))) &&
      (vehicleKeys.length === 0 || (t.vehicles ?? []).some(k => vehicleKeys.includes(k))) &&
      (labelKeys.length === 0 || (t.labels ?? []).some(k => labelKeys.includes(k)))
    );
  }

  // Labels are freeform strings on each trip, not a fixed entity list like drivers/vehicles —
  // the filter's own options are just whichever distinct labels actually appear on the trips
  // in the currently selected period, derived fresh each time rather than stored anywhere.
  labelOptions(trips: Trip[] | null): SelectOption[] {
    if (!trips) return [];
    const labels = new Set<string>();
    trips.forEach(t => (t.labels ?? []).forEach(l => labels.add(l)));
    return Array.from(labels)
      .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}))
      .map(l => ({id: l, name: l}));
  }

  private updateRange(): void {
    this.selectedRange = new DateRange<Moment>(this.from, this.to);
    const from = this.from ? this.datePipe.transform(this.from.toDate(), 'EEEE, d MMMM') : '';
    const to = this.to ? this.datePipe.transform(this.to.toDate(), 'EEEE, d MMMM') : '';
    this.pageHeader.set('Periodeplan', to ? `${from} - ${to}` : from);
  }

}
