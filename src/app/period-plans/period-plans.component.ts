import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {
  NgbCalendar,
  NgbDate,
  NgbDatepicker,
  NgbDropdown,
  NgbDropdownItem,
  NgbDropdownMenu,
  NgbDropdownToggle,
  NgbModal,
} from '@ng-bootstrap/ng-bootstrap';
import {NgbUtility} from '../ngb-date-utility';
import {DataStore} from '../data.service';
import {Trip} from '../trip';
import {Observable} from 'rxjs';
import {Driver} from '../driver';
import {Utility} from '../utility';
import {TripEditorComponent} from '../trip-editor/trip-editor.component';
import {TripsComponent} from '../trips/trips.component';

@Component({
  standalone: true,
  selector: 'app-driver-plans',
  templateUrl: './period-plans.component.html',
  styleUrls: ['./period-plans.component.css'],
  imports: [
    FormsModule, AsyncPipe, DatePipe,
    NgbDatepicker, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem,
    TripsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodPlansComponent implements OnInit {
  readonly ngbUtility = inject(NgbUtility);
  readonly dataStore = inject(DataStore);
  private readonly calendar = inject(NgbCalendar);
  private readonly modalService = inject(NgbModal);

  hovered: NgbDate | null = null;
  from: NgbDate | null = null;
  to: NgbDate | null = null;
  range!: NgbDate[];
  drivers$!: Observable<Driver[]>;
  trips$!: Observable<Trip[]>;
  readonly minDate = this.ngbUtility.minDate(5);

  private _selectedDriver: Driver | null = null;

  isHovered = (date: NgbDate) => this.from && !this.to && this.hovered && this.ngbUtility.after(date, this.from)
    && this.ngbUtility.before(date, this.hovered);
  isInside = (date: NgbDate) => this.ngbUtility.after(date, this.from) && this.ngbUtility.before(date, this.to);
  isFrom = (date: NgbDate) => this.ngbUtility.equals(date, this.from);
  isTo = (date: NgbDate) => this.ngbUtility.equals(date, this.to);

  ngOnInit(): void {
    this.drivers$ = this.dataStore.getAllDrivers();
    this.from = this.calendar.getToday();
    this.to = this.calendar.getNext(this.calendar.getToday(), 'd', 6);
    this.fetchTrips();
  }

  onDateChange(date: NgbDate) {
    if (!this.from && !this.to) {
      this.from = date;
    } else if (this.from && !this.to && this.ngbUtility.after(date, this.from)) {
      this.to = date;
      this.fetchTrips();
    } else {
      this.to = null;
      this.from = date;
    }
  }

  removeTrip(trip: Trip) {
    this.dataStore.removeTrip(trip);
  }

  edit(trip: Trip) {
    const modalRef = this.modalService.open(TripEditorComponent, {size: 'lg'});
    modalRef.componentInstance.edit(trip, (t: Trip, u: any) => this.dataStore.updateTrip(t, u));
  }

  fetchTrips(): void {
    this.range = this.ngbUtility.range(this.from!, this.to);
    this.trips$ = this.dataStore.getTrips(this.from!, this.to!);
  }

  filterByDate(trips: Trip[], date: NgbDate): Trip[] {
    if (!trips || !trips.length) return [];

    const start = this.ngbUtility.toMoment(date);
    const end = this.ngbUtility.toMoment(this.calendar.getNext(date, 'd'));
    return trips.filter(t => t.start >= start! && t.start < end!);
  }

  filterTripsByDriver(trips: Trip[] | null): Trip[] {
    if (!trips) return [];
    if (!this._selectedDriver) return trips;
    return trips.filter(t => Utility.isAssigned(this._selectedDriver!, t));
  }

  set selectedDriver(driver: Driver) {
    this._selectedDriver = (this._selectedDriver && driver.$key === this._selectedDriver.$key) ? null : driver;
  }

  get selectedDriver(): Driver | null {
    return this._selectedDriver;
  }

}
