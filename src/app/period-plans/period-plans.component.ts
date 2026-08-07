import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {DateRange, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatDividerModule} from '@angular/material/divider';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {Moment} from 'moment';
import {DateUtility} from '../date-utility';
import {DataStore} from '../data.service';
import {Trip} from '../trip';
import {Observable} from 'rxjs';
import {Driver} from '../driver';
import {Utility} from '../utility';
import {TripEditorComponent} from '../trip-editor/trip-editor.component';
import {TripsComponent} from '../trips/trips.component';
import {DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-driver-plans',
  templateUrl: './period-plans.component.html',
  styleUrls: ['./period-plans.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatDatepickerModule, MatDividerModule, MatIconModule, MatMenuModule,
    TripsComponent,
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
  drivers$!: Observable<Driver[]>;
  trips$!: Observable<Trip[]>;
  readonly minDate = this.dateUtility.minDate(5);

  // The calendar renders the from/to highlight itself once it is handed a DateRange.
  selectedRange = new DateRange<Moment>(null, null);

  readonly dateClass: MatCalendarCellClassFunction<Moment> = date =>
    this.dateUtility.isPast(date) ? 'past-day' : '';

  private _selectedDriver: Driver | null = null;

  ngOnInit(): void {
    this.drivers$ = this.dataStore.getAllDrivers();
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

  filterTripsByDriver(trips: Trip[] | null): Trip[] {
    if (!trips) return [];
    if (!this._selectedDriver) return trips;
    return trips.filter(t => Utility.isAssigned(this._selectedDriver!, t));
  }

  set selectedDriver(driver: Driver | null) {
    this._selectedDriver = (driver && this._selectedDriver?.$key === driver.$key) ? null : driver;
  }

  get selectedDriver(): Driver | null {
    return this._selectedDriver;
  }

  private updateRange(): void {
    this.selectedRange = new DateRange<Moment>(this.from, this.to);
  }

}
