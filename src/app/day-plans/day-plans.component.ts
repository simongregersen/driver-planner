import {Component, OnInit} from '@angular/core';
import {DataStore} from '../data.service';
import {NewTrip, Trip} from '../trip';
import {NgbCalendar, NgbDateStruct, NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {Driver} from '../driver';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {NgbUtility} from '../ngb-date-utility';
import {Utility} from '../utility';
import {TripEditorComponent} from '../trip-editor/trip-editor.component';
import {SelectOption} from '../select-option';
import {TripCreatorComponent} from '../trip-creator/trip-creator.component';

@Component({
  standalone: false,
  selector: 'app-day-plans',
  templateUrl: './day-plans.component.html',
  styleUrls: ['./day-plans.component.css']
})
export class DayPlansComponent implements OnInit {
  drivers!: Observable<Driver[]>;
  availableTemplates$!: Observable<SelectOption[]>;
  trips$!: Observable<Trip[]>;
  selectedTemplate!: string;
  private _selectedDriver: Driver | null = null;
  private _selectedDate!: NgbDateStruct;

  constructor(public dataStore: DataStore, public ngbUtility: NgbUtility, private calendar: NgbCalendar, private modalService: NgbModal) {
  }

  ngOnInit(): void {
    this.selectedDate = this.calendar.getToday();
    this.drivers = this.dataStore.getAllDrivers();
    this.availableTemplates$ = this.dataStore.getAllTemplates()
      .pipe(map(ts => ts.map(t => ({id: t.$key, name: t.name}))));
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
  }

  get selectedDate(): NgbDateStruct {
    return this._selectedDate;
  }

}
