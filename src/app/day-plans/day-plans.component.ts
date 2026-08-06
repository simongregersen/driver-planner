import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {
  NgbCalendar,
  NgbDateStruct,
  NgbDatepicker,
  NgbDropdown,
  NgbDropdownItem,
  NgbDropdownMenu,
  NgbDropdownToggle,
  NgbModal,
} from '@ng-bootstrap/ng-bootstrap';
import {NgSelectModule} from '@ng-select/ng-select';
import {ConfirmationPopoverModule} from 'angular-confirmation-popover';
import {DataStore} from '../data.service';
import {NewTrip, Trip} from '../trip';
import {Driver} from '../driver';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {NgbUtility} from '../ngb-date-utility';
import {Utility} from '../utility';
import {TripEditorComponent} from '../trip-editor/trip-editor.component';
import {SelectOption} from '../select-option';
import {TripCreatorComponent} from '../trip-creator/trip-creator.component';
import {TripsComponent} from '../trips/trips.component';

@Component({
  standalone: true,
  selector: 'app-day-plans',
  templateUrl: './day-plans.component.html',
  styleUrls: ['./day-plans.component.css'],
  imports: [
    FormsModule, AsyncPipe, DatePipe,
    NgbDatepicker, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem,
    NgSelectModule, ConfirmationPopoverModule, TripsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayPlansComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  readonly ngbUtility = inject(NgbUtility);
  private readonly calendar = inject(NgbCalendar);
  private readonly modalService = inject(NgbModal);

  drivers!: Observable<Driver[]>;
  availableTemplates$!: Observable<SelectOption[]>;
  trips$!: Observable<Trip[]>;
  dayPublic$!: Observable<boolean>;
  publicDates$!: Observable<string[]>;
  selectedTemplate!: string;
  readonly minDate = this.ngbUtility.minDate(5);
  private _selectedDriver: Driver | null = null;
  private _selectedDate!: NgbDateStruct;

  ngOnInit(): void {
    this.selectedDate = this.calendar.getToday();
    this.drivers = this.dataStore.getAllDrivers();
    this.availableTemplates$ = this.dataStore.getAllTemplates()
      .pipe(map(ts => ts.map(t => ({id: t.$key, name: t.name}))));
    this.publicDates$ = this.dataStore.getPublicDates();
  }

  isPublicDate(date: NgbDateStruct, publicDates: string[]): boolean {
    return publicDates.includes(this.ngbUtility.dateKey(this.ngbUtility.toMoment(date)!));
  }

  removeTrip(trip: Trip) {
    this.dataStore.removeTrip(trip);
  }

  edit(trip: Trip) {
    const modalRef = this.modalService.open(TripEditorComponent, {size: 'lg'});
    modalRef.componentInstance.edit(trip, (t: Trip, u: any) => this.dataStore.updateTrip(t, u));
  }

  create() {
    const modalRef = this.modalService.open(TripCreatorComponent, {size: 'lg'});
    modalRef.componentInstance.defaultDate = this.selectedDate;
    modalRef.componentInstance.create.subscribe((t: NewTrip) => this.dataStore.addTrip(t));
  }

  insertTemplate() {
    this.dataStore.insertTemplate(this.ngbUtility.toMoment(this.selectedDate)!, this.selectedTemplate);
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

  set selectedDate(date: NgbDateStruct) {
    this._selectedDate = date;
    this.trips$ = this.dataStore.getTrips(date);
    this.dayPublic$ = this.dataStore.getDayPublic(date);
  }

  get selectedDate(): NgbDateStruct {
    return this._selectedDate;
  }

  setDayPublic(isPublic: boolean) {
    this.dataStore.setDayPublic(this.selectedDate, isPublic);
  }

}
