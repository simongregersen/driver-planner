import {ChangeDetectionStrategy, Component, computed, inject, OnInit, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {DateRange, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {Moment} from 'moment';
import {Observable} from 'rxjs';
import {DateUtility} from '../date-utility';
import {DataStore} from '../data.service';
import {Trip} from '../trip';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {TripEditorComponent} from '../trip-editor/trip-editor.component';
import {TripsComponent} from '../trips/trips.component';
import {ChipFilterComponent} from '../chip-filter/chip-filter.component';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG} from '../dialog-config';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';

@Component({
  standalone: true,
  selector: 'app-driver-plans',
  templateUrl: './period-plans.component.html',
  styleUrls: ['./period-plans.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatDatepickerModule, MatFormFieldModule,
    TripsComponent, ChipFilterComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodPlansComponent implements OnInit {
  readonly dateUtility = inject(DateUtility);
  readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);

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
    const dialogRef = this.dialog.open(TripEditorComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.edit(trip, (t: Trip, u: any) => this.dataStore.updateTrip(t, u), (t: Trip) => this.removeTrip(t));
  }

  fetchTrips(): void {
    this.range = this.dateUtility.range(this.from!, this.to);
    this.trips$ = this.dataStore.getTrips(this.from!, this.to!);
  }

  filterByDate(trips: Trip[], date: Moment): Trip[] {
    if (!trips || !trips.length) return [];

    const start = this.dateUtility.toMoment(date);
    const end = this.dateUtility.toMoment(this.dateUtility.addDays(date, 1));
    return trips.filter(t => t.start >= start! && t.start < end!);
  }

  filterTrips(trips: Trip[] | null): Trip[] {
    if (!trips) return [];
    const driverKeys = this.selectedDriverKeys();
    const vehicleKeys = this.selectedVehicleKeys();
    return trips.filter(t =>
      (driverKeys.length === 0 || (t.drivers ?? []).some(k => driverKeys.includes(k))) &&
      (vehicleKeys.length === 0 || (t.vehicles ?? []).some(k => vehicleKeys.includes(k)))
    );
  }

  private updateRange(): void {
    this.selectedRange = new DateRange<Moment>(this.from, this.to);
  }

}
