import {Injectable} from '@angular/core';
import {child, endAt, orderByChild, orderByKey, push, query, ref, remove, startAt, update} from 'firebase/database';
import {listVal, objectVal} from 'rxfire/database';
import {NewTrip, Trip} from './trip';
import {ClockRecord} from './clock-record';
import {Driver} from './driver';
import {AppUser} from './user';
import {combineLatest, firstValueFrom, Observable} from 'rxjs';
import {first, map, tap} from 'rxjs/operators';
import {Vehicle} from './vehicle';
import {DateUtility} from './date-utility';
import {Utility} from './utility';
import {Template} from './template';
import {NewNote, Note} from './note';
import {db} from './firebase';
import {Moment} from 'moment';
import moment from 'moment';
import {NotificationDispatchService} from './notification-dispatch.service';

// How far back getTrips looks for a multi-day trip via its own multiDayStart-indexed query (see
// below) — trips lasting more than 1-2 weeks are very uncommon, so this is a generous margin
// past that, not a tight fit. A multi-day trip starting further back than this would silently
// stop appearing on its later days once it's this far in the past.
const MULTI_DAY_LOOKBACK_DAYS = 30;

@Injectable({providedIn: 'root'})
export class DataStore {
  private driversRef = ref(db, '/drivers');
  private vehiclesRef = ref(db, '/vehicles');
  private tripsRef = ref(db, '/trips');
  private clockRecordsRef = ref(db, '/clockRecords');
  private templatesRef = ref(db, '/templates');
  private publicRef = ref(db, '/public');
  private usersRef = ref(db, '/users');
  private notificationQueueRef = ref(db, '/notificationQueue');
  private notesRef = ref(db, '/notes');

  constructor(private dateUtility: DateUtility, private notificationDispatch: NotificationDispatchService) {
  }

  // Returns trips *overlapping* [from, to) — including a multi-day trip that started before
  // `from`, as long as it hadn't already ended before `from` — not just ones starting in it.
  //
  // Realtime Database can only order/range-filter by one child key per query (no compound
  // indexes), and that key has to be `start` rather than `end` since `end` is often null (a
  // single-day trip) and RTDB sorts a missing child before every real value, which would
  // silently exclude those trips from an end-anchored query. Widening the `start` query itself
  // to reach further back (an earlier version of this did that) would work too, but means
  // scanning that whole extra stretch of ordinary single-day trips just to find the rare ones
  // that might span into this window — wasteful on a free-tier read quota. Since multi-day
  // trips are uncommon, this instead fetches them via their own sparse multiDayStart index (see
  // addTrip/updateTrip) — present only on multi-day trips, so this stays cheap regardless of
  // how many ordinary single-day trips exist — and merges that with the normal windowed query.
  getTrips(from: Moment, to?: Moment): Observable<Trip[]> {
    const fromDate = this.dateUtility.toMoment(from)!;
    const toDate = (to) ? this.dateUtility.toMoment(to)! : moment(fromDate);
    toDate.add(1, 'days');

    const inWindow$ = listVal<Trip>(
      query(this.tripsRef, orderByChild('start'), startAt(fromDate.valueOf()), endAt(toDate.valueOf() - 1)),
      {keyField: '$key'}
    );
    const multiDayLookback = fromDate.clone().subtract(MULTI_DAY_LOOKBACK_DAYS, 'days');
    const multiDay$ = listVal<Trip>(
      query(this.tripsRef, orderByChild('multiDayStart'), startAt(multiDayLookback.valueOf()), endAt(toDate.valueOf() - 1)),
      {keyField: '$key'}
    );

    return combineLatest([inWindow$, multiDay$]).pipe(
      // Every trip left over from multiDay$ once inWindow$'s own trips are excluded must have
      // started before `from` (a trip starting within the window would have matched inWindow$
      // too) — earlier than anything in inWindow$, in other words. multiDay$ is itself already
      // ordered by start (its query is ordered by multiDayStart, which is exactly that), so
      // putting those first, ahead of inWindow$'s own start-ordered results, keeps the combined
      // list correctly ordered by actual start time without a separate sort.
      map(([inWindow, multiDay]) => {
        const inWindowKeys = new Set(inWindow.map(t => t.$key));
        const beforeWindow = multiDay.filter(t => !inWindowKeys.has(t.$key));
        return [...beforeWindow, ...inWindow];
      }),
      tap(ts => ts.forEach(t => {
        t.start = moment(t.start as any);
        t.end = (t.end) ? moment(t.end as any) : null;
        t.modified = (t.modified) ? moment(t.modified as any) : undefined;
      })),
      map(ts => ts.filter(t => Utility.tripOverlaps(t, fromDate, toDate)))
    );
  }

  addTrip(trip: NewTrip) {
    return push(this.tripsRef, {
      start: trip.start.valueOf(),
      end: (trip.end) ? trip.end.valueOf() : null,
      name: trip.name,
      description: trip.description || '',
      officeDescription: trip.officeDescription || '',
      invoiced: trip.invoiced || false,
      drivers: trip.drivers || [],
      vehicles: trip.vehicles || [],
      multiDayStart: this.multiDayStart(trip.start, trip.end)
    });
  }

  updateTrip(trip: Trip, updates: any) {
    // Gates on the destination day (updates.start is always populated by the trip editor on every submit),
    // so this reflects where the trip ends up, not where it was before the edit.
    const effectiveStart: Moment = updates.start || trip.start;
    if (updates.start) {
      // The trip editor's save always carries both start and end together (never just one of
      // the two), so this can be recomputed from the update alone rather than merged with the
      // existing trip. Explicit null clears a previously-set flag now that this trip no longer
      // spans multiple calendar days — update() only touches keys it's given, so omitting this
      // instead would leave a stale value in place.
      updates.multiDayStart = this.multiDayStart(updates.start, updates.end);
      updates.start = updates.start.valueOf();
    }
    if (updates.end) updates.end = updates.end.valueOf();
    return firstValueFrom(this.isDayPublic(effectiveStart)).then(isPublic => {
      if (isPublic) updates.modified = moment().valueOf();
      return update(child(this.tripsRef, trip.$key), updates).then(() => {
        if (isPublic) {
          this.enqueueTripChangeNotification(updates.drivers || trip.drivers, trip.name, trip.start);
        }
      });
    });
  }

  // The value getTrips' multiDayStart-indexed query above filters on — present (as the trip's
  // own start) only when the trip actually spans more than one calendar day, absent (as null,
  // which Firebase treats as "omit this key") otherwise, so the index stays sparse.
  private multiDayStart(start: Moment, end: Moment | null | undefined): number | null {
    return (end && !Utility.sameDate(start, end)) ? start.valueOf() : null;
  }

  // Best-effort: a notification failing to enqueue shouldn't fail the trip save itself.
  private async enqueueTripChangeNotification(driverIds: string[], tripName: string, start: Moment): Promise<void> {
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
        body: `${tripName} ${start.format('[d.] D. MMMM [kl.] HH:mm')}`,
        createdAt: Date.now(),
      });
      this.notificationDispatch.trigger();
    } catch (err) {
      console.warn('Could not enqueue trip-change notification', err);
    }
  }

  // Open-ended above when `to` is omitted — callers wanting a rolling "since X" window (the
  // punch widget's open-record lookback, the reporting list's recent window) don't want this
  // silently narrowed to a single day the way getTrips's default range is.
  getClockRecords(driverKey: string, from: Moment, to?: Moment): Observable<ClockRecord[]> {
    const fromDate = this.dateUtility.toMoment(from)!;
    const driverRef = child(this.clockRecordsRef, driverKey);
    const q = to
      ? query(driverRef, orderByChild('clockIn'), startAt(fromDate.valueOf()), endAt(this.dateUtility.toMoment(to)!.add(1, 'days').valueOf() - 1))
      : query(driverRef, orderByChild('clockIn'), startAt(fromDate.valueOf()));
    return listVal<ClockRecord>(q, {keyField: '$key'}).pipe(
      tap(rs => rs.forEach(r => {
        r.clockIn = moment(r.clockIn as any);
        r.clockOut = (r.clockOut) ? moment(r.clockOut as any) : null;
      }))
    );
  }

  addClockRecord(driverKey: string, clockIn: Moment, note?: string | null) {
    return push(child(this.clockRecordsRef, driverKey), {clockIn: clockIn.valueOf(), clockOut: null, note: note || null});
  }

  updateClockRecord(driverKey: string, record: ClockRecord, updates: {clockIn?: Moment; clockOut?: Moment | null; note?: string | null}) {
    const payload: any = {};
    if (updates.clockIn) payload.clockIn = updates.clockIn.valueOf();
    if ('clockOut' in updates) payload.clockOut = updates.clockOut ? updates.clockOut.valueOf() : null;
    if ('note' in updates) payload.note = updates.note || null;
    return update(child(this.clockRecordsRef, `${driverKey}/${record.$key}`), payload);
  }

  removeClockRecord(driverKey: string, record: ClockRecord) {
    return remove(child(this.clockRecordsRef, `${driverKey}/${record.$key}`));
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
      officeDescription: trip.officeDescription || '',
      invoiced: trip.invoiced || false,
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

  // Notes are low-volume (a handful of vacations/shop visits at a time) compared to trips, so
  // unlike getTrips there's no windowed query here — every caller just fetches all of them and
  // filters client-side for whichever date(s) it cares about.
  getAllNotes(): Observable<Note[]> {
    return listVal<Note>(this.notesRef, {keyField: '$key'}).pipe(
      tap(ns => ns.forEach(n => {
        n.start = this.dateUtility.getDate(moment(n.start as any));
        n.end = this.dateUtility.getDate(moment(n.end as any));
      }))
    );
  }

  addNote(note: NewNote) {
    return push(this.notesRef, {
      start: note.start.valueOf(),
      end: note.end.valueOf(),
      text: note.text || '',
      drivers: note.drivers || [],
      vehicles: note.vehicles || []
    });
  }

  updateNote(note: Note, updates: any) {
    if (updates.start) updates.start = updates.start.valueOf();
    if (updates.end) updates.end = updates.end.valueOf();
    return update(child(this.notesRef, note.$key), updates);
  }

  removeNote(note: Note) {
    return remove(child(this.notesRef, note.$key));
  }
}
