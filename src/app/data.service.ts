import {Injectable} from '@angular/core';
import {child, endAt, orderByChild, orderByKey, push, query, ref, remove, startAt, update} from 'firebase/database';
import {listVal, objectVal} from 'rxfire/database';
import {NewTrip, Trip, TripReport} from './trip';
import {Driver} from './driver';
import {AppUser} from './user';
import {firstValueFrom, Observable} from 'rxjs';
import {first, map, tap} from 'rxjs/operators';
import {Vehicle} from './vehicle';
import {DateUtility} from './date-utility';
import {Utility} from './utility';
import {Template} from './template';
import {db} from './firebase';
import {Moment} from 'moment';
import moment from 'moment';
import {NotificationDispatchService} from './notification-dispatch.service';

@Injectable({providedIn: 'root'})
export class DataStore {
  private driversRef = ref(db, '/drivers');
  private vehiclesRef = ref(db, '/vehicles');
  private tripsRef = ref(db, '/trips');
  private templatesRef = ref(db, '/templates');
  private publicRef = ref(db, '/public');
  private usersRef = ref(db, '/users');
  private notificationQueueRef = ref(db, '/notificationQueue');

  constructor(private dateUtility: DateUtility, private notificationDispatch: NotificationDispatchService) {
  }

  getTrips(from: Moment, to?: Moment): Observable<Trip[]> {
    const fromDate = this.dateUtility.toMoment(from)!;
    const toDate = (to) ? this.dateUtility.toMoment(to)! : moment(fromDate);
    toDate.add(1, 'days');

    const q = query(this.tripsRef, orderByChild('start'), startAt(fromDate.valueOf()), endAt(toDate.valueOf() - 1));
    return listVal<Trip>(q, {keyField: '$key'}).pipe(
      tap(ts => ts.forEach(t => {
        t.start = moment(t.start as any);
        t.end = (t.end) ? moment(t.end as any) : null;
        t.modified = (t.modified) ? moment(t.modified as any) : undefined;
        if (t.reports) {
          Object.values(t.reports).forEach((r: any) => {
            r.actualStart = (r.actualStart) ? moment(r.actualStart as any) : undefined;
            r.garageReturn = (r.garageReturn) ? moment(r.garageReturn as any) : undefined;
            r.actualEnd = (r.actualEnd) ? moment(r.actualEnd as any) : undefined;
          });
        }
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
    // Gates on the destination day (updates.start is always populated by the trip editor on every submit),
    // so this reflects where the trip ends up, not where it was before the edit.
    const effectiveStart: Moment = updates.start || trip.start;
    if (updates.start) updates.start = updates.start.valueOf();
    if (updates.end) updates.end = updates.end.valueOf();
    return firstValueFrom(this.isDayPublic(effectiveStart)).then(isPublic => {
      if (isPublic) updates.modified = moment().valueOf();
      return update(child(this.tripsRef, trip.$key), updates).then(() => {
        if (isPublic) {
          this.enqueueTripChangeNotification(updates.drivers || trip.drivers, trip.name);
        }
      });
    });
  }

  // Best-effort: a notification failing to enqueue shouldn't fail the trip save itself.
  private async enqueueTripChangeNotification(driverIds: string[], tripName: string): Promise<void> {
    if (!driverIds?.length) return;
    try {
      const users = await firstValueFrom(this.getAllUsers());
      const uids = Object.entries(users)
        .filter(([, user]) => user.driverId && driverIds.includes(user.driverId))
        .map(([uid]) => uid);
      if (!uids.length) return;

      await push(this.notificationQueueRef, {
        uids,
        title: 'Din tur er blevet opdateret',
        body: tripName,
        createdAt: Date.now(),
      });
      this.notificationDispatch.trigger();
    } catch (err) {
      console.warn('Could not enqueue trip-change notification', err);
    }
  }

  // Not tracked as a "modification" (doesn't touch trip.modified) — a driver logging their own
  // times shouldn't highlight the trip as recently changed by someone else.
  updateTripReport(trip: Trip, driverKey: string, report: TripReport) {
    const serialized = {
      actualStart: (report.actualStart) ? report.actualStart.valueOf() : null,
      garageReturn: (report.garageReturn) ? report.garageReturn.valueOf() : null,
      actualEnd: (report.actualEnd) ? report.actualEnd.valueOf() : null,
    };
    return update(child(this.tripsRef, trip.$key), {[`reports/${driverKey}`]: serialized});
  }

  removeTrip(trip: Trip) {
    return remove(child(this.tripsRef, trip.$key));
  }

  private isDayPublic(date: Moment): Observable<boolean> {
    const key = this.dateUtility.dateKey(date);
    return objectVal<boolean>(child(this.publicRef, key)).pipe(map(v => !!v));
  }

  getDayPublic(date: Moment): Observable<boolean> {
    return this.isDayPublic(this.dateUtility.toMoment(date)!);
  }

  setDayPublic(date: Moment, isPublic: boolean) {
    const key = this.dateUtility.dateKey(this.dateUtility.toMoment(date)!);
    if (isPublic) return update(this.publicRef, {[key]: true});
    return remove(child(this.publicRef, key));
  }

  getPublicDates(): Observable<string[]> {
    return objectVal<Record<string, boolean> | null>(this.publicRef).pipe(
      map(dates => Object.keys(dates || {}))
    );
  }

  getPublicDatesInRange(from: Moment, to: Moment): Observable<string[]> {
    const fromKey = this.dateUtility.dateKey(from);
    const toKey = this.dateUtility.dateKey(to);
    const q = query(this.publicRef, orderByKey(), startAt(fromKey), endAt(toKey));
    return objectVal<Record<string, boolean> | null>(q).pipe(
      map(dates => Object.keys(dates || {}))
    );
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

  getAllUsers(): Observable<Record<string, AppUser>> {
    return objectVal<Record<string, AppUser> | null>(this.usersRef).pipe(map(users => users || {}));
  }

  setUserAdmin(uid: string, isAdmin: boolean) {
    return update(child(this.usersRef, uid), {role: isAdmin ? 'admin' : 'driver'});
  }

  updateDriver(driver: Driver, updates: any) {
    if (updates.birthday) updates.birthday = updates.birthday.valueOf();
    return update(child(this.driversRef, driver.$key), updates);
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

  updateVehicle(vehicle: Vehicle, updates: any) {
    if (updates.latestInspection) updates.latestInspection = updates.latestInspection.valueOf();
    return update(child(this.vehiclesRef, vehicle.$key), updates);
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
