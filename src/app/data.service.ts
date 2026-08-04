import {Injectable} from '@angular/core';
import {child, endAt, orderByChild, push, query, ref, remove, startAt, update} from 'firebase/database';
import {listVal, objectVal} from 'rxfire/database';
import {NewTrip, Trip} from './trip';
import {Driver} from './driver';
import {Observable} from 'rxjs';
import {first, map, tap} from 'rxjs/operators';
import {Vehicle} from './vehicle';
import {NgbUtility} from './ngb-date-utility';
import {NgbDateStruct} from '@ng-bootstrap/ng-bootstrap';
import {Utility} from './utility';
import {Template} from './template';
import {db} from './firebase';
import {Moment} from 'moment';
import moment from 'moment';

@Injectable()
export class DataStore {
  private driversRef = ref(db, '/drivers');
  private vehiclesRef = ref(db, '/vehicles');
  private tripsRef = ref(db, '/trips');
  private templatesRef = ref(db, '/templates');

  constructor(private ngbUtility: NgbUtility) {
  }

  getTrips(from: NgbDateStruct, to?: NgbDateStruct): Observable<Trip[]> {
    const fromDate = this.ngbUtility.toMoment(from)!;
    const toDate = (to) ? this.ngbUtility.toMoment(to)! : moment(fromDate);
    toDate.add(1, 'days');

    const q = query(this.tripsRef, orderByChild('start'), startAt(fromDate.valueOf()), endAt(toDate.valueOf() - 1));
    return listVal<Trip>(q, {keyField: '$key'}).pipe(
      tap(ts => ts.forEach(t => {
        t.start = moment(t.start as any);
        t.end = (t.end) ? moment(t.end as any) : null;
      }))
    );
  }

  addTrip(trip: NewTrip) {
    return push(this.tripsRef, {
      start: trip.start.valueOf(),
      end: (trip.end) ? trip.end.valueOf() : null,
      name: trip.name,
      description: trip.description || '',
      drivers: trip.drivers || [],
      vehicles: trip.vehicles || []
    });
  }

  updateTrip(trip: Trip, updates: any) {
    if (updates.start) updates.start = updates.start.valueOf();
    if (updates.end) updates.end = updates.end.valueOf();
    return update(child(this.tripsRef, trip.$key), updates);
  }

  removeTrip(trip: Trip) {
    return remove(child(this.tripsRef, trip.$key));
  }

  getAllDrivers(): Observable<Driver[]> {
    return listVal<Driver>(this.driversRef, {keyField: '$key'}).pipe(
      map(Utility.filterDeleted),
      map(Utility.sortByDisplayName),
      tap(ds => ds.forEach(d => {
        if (d.birthday) d.birthday = moment(d.birthday as any);
      }))
    );
  }

  addDriver(displayName: string, name: string, birthday: Moment | null) {
    const driver = {displayName, name, birthday: (birthday) ? birthday.valueOf() : null, deleted: false};
    return push(this.driversRef, driver);
  }

  deleteDriver(driver: Driver) {
    return update(child(this.driversRef, driver.$key), {deleted: true});
  }

  getDriver(key: string): Observable<Driver> {
    return objectVal<Driver>(child(this.driversRef, key), {keyField: '$key'});
  }

  getAllVehicles(): Observable<Vehicle[]> {
    return listVal<Vehicle>(this.vehiclesRef, {keyField: '$key'}).pipe(
      map(Utility.sortByDisplayName),
      tap(ds => ds.forEach(d => {
        if (d.latestInspection) d.latestInspection = new Date(d.latestInspection as any) as any;
      }))
    );
  }

  addVehicle(displayName: string, brand: string, regNo: string, latestInspection: Moment | null) {
    const vehicle = {
      displayName,
      brand,
      regNo,
      latestInspection: (latestInspection) ? latestInspection.valueOf() : null,
      deleted: false
    };
    push(this.vehiclesRef, vehicle);
  }

  deleteVehicle(vehicle: Vehicle) {
    return update(child(this.vehiclesRef, vehicle.$key), {deleted: true});
  }

  getVehicle(key: string): Observable<Vehicle> {
    return objectVal<Vehicle>(child(this.vehiclesRef, key), {keyField: '$key'});
  }

  getAllTemplates(): Observable<Template[]> {
    return listVal<Template>(this.templatesRef, {keyField: '$key'});
  }

  addTemplate(name: string) {
    return push(this.templatesRef, {name: name});
  }

  removeTemplate(template: Template) {
    remove(ref(db, `/tripsInTemplate/${template.$key}`));
    remove(child(this.templatesRef, template.$key));
  }

  addTripToTemplate(template: Template, trip: NewTrip) {
    const tripsInTemplateRef = ref(db, `/tripsInTemplate/${template.$key}`);
    return push(tripsInTemplateRef, {
      start: trip.start.valueOf(),
      end: (trip.end) ? trip.end.valueOf() : null,
      name: trip.name,
      description: trip.description || '',
      drivers: trip.drivers || [],
      vehicles: trip.vehicles || []
    });
  }

  updateTripFromTemplate(template: Template, trip: Trip, updates: any) {
    if (updates.start) updates.start = updates.start.valueOf();
    if (updates.end) updates.end = updates.end.valueOf();
    const tripsInTemplateRef = ref(db, `/tripsInTemplate/${template.$key}`);
    return update(child(tripsInTemplateRef, trip.$key), updates);
  }

  removeTripFromTemplate(template: Template, trip: Trip) {
    return remove(ref(db, `/tripsInTemplate/${template.$key}/${trip.$key}`));
  }

  insertTemplate(date: Moment, templateKey: string) {
    const tripsInTemplateRef = ref(db, `/tripsInTemplate/${templateKey}`);
    listVal<Trip>(tripsInTemplateRef, {keyField: '$key'}).pipe(first()).subscribe(trips => {
      trips.forEach(t => {
        if (t.start) {
          t.start = moment(t.start as any);
          Utility.copyDate(date, t.start);
        }
        if (t.end) {
          t.end = moment(t.end as any);
          Utility.copyDate(date, t.end);
        }
        this.addTrip(t);
      })
    });

  }

  getTemplateTrips(template: Template): Observable<Trip[]> {
    const q = query(ref(db, `/tripsInTemplate/${template.$key}`), orderByChild('start'));
    return listVal<Trip>(q, {keyField: '$key'}).pipe(
      tap(ts => ts.forEach(t => {
        t.start = moment(t.start as any);
        t.end = (t.end) ? moment(t.end as any) : null;
      }))
    );
  }
}
