import {Injectable, inject} from '@angular/core';
import {child, endAt, endBefore, get, limitToLast, orderByChild, orderByKey, push, query, Query, ref, remove, startAt, update} from 'firebase/database';
import {listVal, objectVal} from 'rxfire/database';
import {NewTrip, Trip, TripReport} from './trip';
import {ClockRecord} from './clock-record';
import {FuelReport, NewFuelReport} from './fuel-report';
import {Driver, NewDriver} from './driver';
import {AppUser} from './user';
import {combineLatest, firstValueFrom, from as observableFrom, Observable, of} from 'rxjs';
import {first, map, shareReplay, tap} from 'rxjs/operators';
import {NewVehicle, Vehicle} from './vehicle';
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
  private fuelReportsRef = ref(db, '/fuelReports');
  private templatesRef = ref(db, '/templates');
  private publicRef = ref(db, '/public');
  private usersRef = ref(db, '/users');
  private notificationQueueRef = ref(db, '/notificationQueue');
  private notesRef = ref(db, '/notes');

  private readonly dateUtility = inject(DateUtility);
  private readonly notificationDispatch = inject(NotificationDispatchService);

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
        t.start = moment(t.start as unknown as number);
        t.end = (t.end) ? moment(t.end as unknown as number) : null;
        t.modified = (t.modified) ? moment(t.modified as unknown as number) : undefined;
        if (t.reports) {
          Object.values(t.reports).forEach(r => {
            r.start = (r.start) ? moment(r.start as unknown as number) : null;
            r.end = (r.end) ? moment(r.end as unknown as number) : null;
          });
        }
      })),
      map(ts => ts.filter(t => Utility.tripOverlaps(t, fromDate, toDate)))
    );
  }

  // Mirrors updateTrip's own public-day check: a trip landing on a day that's already public is
  // just as much news to whoever already saw that day's plan as an edit to an existing trip
  // would be, so it gets the same `modified` stamp (and the same "recently modified" highlight —
  // see TripsComponent.isRecentlyModified) rather than looking indistinguishable from a trip
  // that was there all along.
  addTrip(trip: NewTrip) {
    return firstValueFrom(this.isDayPublic(trip.start)).then(isPublic => push(this.tripsRef, {
      start: trip.start.valueOf(),
      end: (trip.end) ? trip.end.valueOf() : null,
      name: trip.name,
      description: trip.description || '',
      officeDescription: trip.officeDescription || '',
      labels: trip.labels || [],
      drivers: trip.drivers || [],
      vehicles: trip.vehicles || [],
      multiDayStart: this.multiDayStart(trip.start, trip.end),
      ...(isPublic ? {modified: moment().valueOf()} : {}),
    }).then(ref => {
      if (isPublic) {
        this.enqueueTripChangeNotification(trip.drivers, trip.name, trip.start, 'Der er tilføjet en ny tur');
      }
      return ref;
    }));
  }

  updateTrip(trip: Trip, updates: Partial<NewTrip>) {
    // Gates on the destination day (updates.start is always populated by the trip editor on every submit),
    // so this reflects where the trip ends up, not where it was before the edit.
    const effectiveStart: Moment = updates.start || trip.start;
    const payload: Record<string, unknown> = {...updates};
    if (updates.start) {
      // The trip editor's save always carries both start and end together (never just one of
      // the two), so this can be recomputed from the update alone rather than merged with the
      // existing trip. Explicit null clears a previously-set flag now that this trip no longer
      // spans multiple calendar days — update() only touches keys it's given, so omitting this
      // instead would leave a stale value in place.
      payload.multiDayStart = this.multiDayStart(updates.start, updates.end);
      payload.start = updates.start.valueOf();
    }
    if (updates.end) payload.end = updates.end.valueOf();
    return firstValueFrom(this.isDayPublic(effectiveStart)).then(isPublic => {
      if (isPublic) payload.modified = moment().valueOf();
      return update(child(this.tripsRef, trip.$key), payload).then(() => {
        if (isPublic) {
          this.enqueueTripChangeNotification(updates.drivers || trip.drivers, trip.name, trip.start);
        }
      });
    });
  }

  // Always a full replacement of that one driver's report (never a partial update) — matches
  // "a driver can only make one report per trip", edited as a whole rather than field by field.
  // Written at trips/$tripKey/reports/$driverKey specifically (not through updateTrip) since
  // that's its own carve-out in database.rules.json: a driver can write there for their own
  // driverKey without needing admin-level write access to the trip as a whole.
  setTripReport(tripKey: string, driverKey: string, report: TripReport) {
    return update(child(this.tripsRef, `${tripKey}/reports/${driverKey}`), {
      start: report.start ? report.start.valueOf() : null,
      startFromCustomer: report.startFromCustomer,
      end: report.end ? report.end.valueOf() : null,
      endFromCustomer: report.endFromCustomer,
      startKm: report.startKm ?? null,
      startKmFromCustomer: report.startKmFromCustomer,
      endKm: report.endKm ?? null,
      endKmFromCustomer: report.endKmFromCustomer,
      note: report.note || ''
    });
  }

  // Same write carve-out as setTripReport above (a delete is still a write at this path), so a
  // driver can remove their own report without needing admin-level access to the trip as a whole.
  deleteTripReport(tripKey: string, driverKey: string) {
    return remove(child(this.tripsRef, `${tripKey}/reports/${driverKey}`));
  }

  // The value getTrips' multiDayStart-indexed query above filters on — present (as the trip's
  // own start) only when the trip actually spans more than one calendar day, absent (as null,
  // which Firebase treats as "omit this key") otherwise, so the index stays sparse.
  private multiDayStart(start: Moment, end: Moment | null | undefined): number | null {
    return (end && !Utility.sameDate(start, end)) ? start.valueOf() : null;
  }

  // Best-effort: a notification failing to enqueue shouldn't fail the trip save itself.
  private async enqueueTripChangeNotification(driverIds: string[], tripName: string, start: Moment, title = 'Din tur er blevet opdateret'): Promise<void> {
    if (!driverIds?.length) return;
    try {
      const users = await firstValueFrom(this.getAllUsers());
      const uids = Object.entries(users)
        .filter(([, user]) => user.driverId && driverIds.includes(user.driverId))
        .map(([uid]) => uid);
      if (!uids.length) return;

      await push(this.notificationQueueRef, {
        uids,
        title,
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
        r.clockIn = moment(r.clockIn as unknown as number);
        r.clockOut = (r.clockOut) ? moment(r.clockOut as unknown as number) : null;
      }))
    );
  }

  addClockRecord(driverKey: string, clockIn: Moment, note?: string | null, clockOut?: Moment | null) {
    return push(child(this.clockRecordsRef, driverKey), {clockIn: clockIn.valueOf(), clockOut: clockOut ? clockOut.valueOf() : null, note: note || null});
  }

  updateClockRecord(driverKey: string, record: ClockRecord, updates: {clockIn?: Moment; clockOut?: Moment | null; note?: string | null}) {
    const payload: Record<string, unknown> = {};
    if (updates.clockIn) payload.clockIn = updates.clockIn.valueOf();
    if ('clockOut' in updates) payload.clockOut = updates.clockOut ? updates.clockOut.valueOf() : null;
    if ('note' in updates) payload.note = updates.note || null;
    return update(child(this.clockRecordsRef, `${driverKey}/${record.$key}`), payload);
  }

  removeClockRecord(driverKey: string, record: ClockRecord) {
    return remove(child(this.clockRecordsRef, `${driverKey}/${record.$key}`));
  }

  // A one-time read rather than a live listener — unlike trips/clock records, this is a
  // backward-looking date-range report (see FuelTrackingComponent/FuelReportingComponent) over
  // data that's only ever written by whichever driver logged it, so another admin/driver
  // changing it while the report happens to be open is rare enough that a manual reload covers
  // it. Not worth keeping open the 2×N persistent Firebase connections (N = fleet size,
  // multiplied by getFuelReportsForVehicles/getLatestFuelReportBefore below) a live listener per
  // vehicle would cost every time this report is viewed.
  //
  // Keyed by vehicle rather than driver (see FuelReport's doc comment) — open-ended above when
  // `to` is omitted, same rationale as getClockRecords.
  getFuelReports(vehicleKey: string, from: Moment, to?: Moment): Observable<FuelReport[]> {
    const fromDate = this.dateUtility.toMoment(from)!;
    const vehicleRef = child(this.fuelReportsRef, vehicleKey);
    const q = to
      ? query(vehicleRef, orderByChild('date'), startAt(fromDate.valueOf()), endAt(this.dateUtility.toMoment(to)!.add(1, 'days').valueOf() - 1))
      : query(vehicleRef, orderByChild('date'), startAt(fromDate.valueOf()));
    return observableFrom(this.fetchFuelReports(q));
  }

  private async fetchFuelReports(q: Query): Promise<FuelReport[]> {
    const snapshot = await get(q);
    const reports: FuelReport[] = [];
    snapshot.forEach(child => {
      const report = {...(child.val() as Record<string, unknown>), $key: child.key} as FuelReport;
      report.date = moment(report.date as unknown as number);
      reports.push(report);
    });
    return reports;
  }

  addFuelReport(vehicleKey: string, report: NewFuelReport) {
    return push(child(this.fuelReportsRef, vehicleKey), {
      date: report.date.valueOf(),
      driverKey: report.driverKey,
      odometerKm: report.odometerKm,
      liters: report.liters,
      note: report.note || ''
    });
  }

  updateFuelReport(vehicleKey: string, record: FuelReport, updates: {date?: Moment; odometerKm?: number | null; liters?: number | null; note?: string}) {
    const payload: Record<string, unknown> = {...updates};
    if (updates.date) payload.date = updates.date.valueOf();
    return update(child(this.fuelReportsRef, `${vehicleKey}/${record.$key}`), payload);
  }

  removeFuelReport(vehicleKey: string, record: FuelReport) {
    return remove(child(this.fuelReportsRef, `${vehicleKey}/${record.$key}`));
  }

  // For the fuel-tracking page's both branches: an admin passes the vehicles it wants to see
  // (or all of them), and a driver also passes all vehicles — the .read rule on each report
  // (see database.rules.json) already restricts what comes back to that driver's own reports,
  // so there's no need to filter by driver client-side either way.
  getFuelReportsForVehicles(vehicles: Vehicle[], from: Moment, to?: Moment): Observable<(FuelReport & {vehicleKey: string; vehicleName: string})[]> {
    if (!vehicles.length) return of([]);
    return combineLatest(vehicles.map(v =>
      this.getFuelReports(v.$key, from, to).pipe(
        map(rs => rs.map(r => ({...r, vehicleKey: v.$key, vehicleName: v.displayName})))
      )
    )).pipe(map(lists => lists.flat()));
  }

  // The single most recent report strictly before `before` — used only as a distance baseline
  // when a vehicle has just one reading inside an admin-selected period (see
  // FuelTrackingComponent.vehicleGroups): a lone in-period reading can't produce a distance on
  // its own, but diffing it against the last reading before the period can. Never shown as a
  // report row itself, only folded into that distance/km-per-L computation.
  getLatestFuelReportBefore(vehicleKey: string, before: Moment): Observable<FuelReport | null> {
    const vehicleRef = child(this.fuelReportsRef, vehicleKey);
    const q = query(vehicleRef, orderByChild('date'), endAt(this.dateUtility.toMoment(before)!.valueOf() - 1), limitToLast(1));
    return observableFrom(this.fetchFuelReports(q).then(reports => reports[0] ?? null));
  }

  removeTrip(trip: Trip) {
    return remove(child(this.tripsRef, trip.$key));
  }

  // Trips whose `start` predates the cutoff — used only by the admin-only /cleanup page (GDPR:
  // trip/customer data isn't kept longer than a fixed retention period). `start` is always set
  // (unlike the sparse multiDayStart copy — see addTrip/updateTrip above), so this alone is
  // sufficient; no multiDayStart union is needed the way getTrips does for its overlap queries.
  //
  // Deliberately returns raw {$key, start} pairs rather than hydrated Trip objects: the cleanup
  // page only ever needs the key (to delete) and the two boundary start timestamps (to report a
  // date range) — this cutoff can match tens of thousands of trips, so converting every one of
  // them to a Moment just to discard all but two would be pure waste. The query result is
  // already ordered by `start` ascending (orderByChild), so the caller can read the oldest/newest
  // straight off the ends of the array without sorting either.
  getTripsOlderThan(cutoff: Moment): Observable<{$key: string; start: number}[]> {
    return listVal<{$key: string; start: number}>(
      query(this.tripsRef, orderByChild('start'), endAt(cutoff.valueOf() - 1)),
      {keyField: '$key'},
    );
  }

  // One multi-path update rather than one remove() per trip — a single atomic write regardless
  // of how many trips are being purged. The /trips container's own .write rule (admin-only)
  // already covers every key in a multi-path update the same way it covers updateTrip's
  // single-key update, so no database.rules.json change is needed for this.
  removeTrips(tripKeys: string[]): Promise<void> {
    if (!tripKeys.length) return Promise.resolve();
    const updates: Record<string, null> = {};
    tripKeys.forEach(k => { updates[k] = null; });
    return update(this.tripsRef, updates);
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

  // Public-date markers whose key predates the cutoff — used only by the admin-only /cleanup
  // page. Keys are 'YYYY-MM-DD' date strings, which sort lexicographically the same as
  // chronologically, so an orderByKey query works the same way getPublicDatesInRange's own does.
  getPublicDatesOlderThan(cutoff: Moment): Observable<string[]> {
    const cutoffKey = this.dateUtility.dateKey(cutoff);
    const q = query(this.publicRef, orderByKey(), endBefore(cutoffKey));
    return objectVal<Record<string, boolean> | null>(q).pipe(
      map(dates => Object.keys(dates || {}))
    );
  }

  // One multi-path update rather than one remove() per date — same rationale as removeTrips.
  removePublicDates(dateKeys: string[]): Promise<void> {
    if (!dateKeys.length) return Promise.resolve();
    const updates: Record<string, null> = {};
    dateKeys.forEach(k => { updates[k] = null; });
    return update(this.publicRef, updates);
  }

  getAllDrivers(): Observable<Driver[]> {
    return listVal<Driver>(this.driversRef, {keyField: '$key'}).pipe(
      map(Utility.filterDeleted),
      map(Utility.sortByDisplayName),
      tap(ds => ds.forEach(d => {
        if (d.birthday) d.birthday = moment(d.birthday as unknown as number);
      })),
      // Called independently from many components (page-level chip filters, nested
      // TripsComponent, form pickers, ...) with no multicasting otherwise — this keeps a single
      // live /drivers listener shared across all of them instead of one per caller.
      shareReplay({bufferSize: 1, refCount: true}),
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

  updateDriver(driver: Driver, updates: Partial<NewDriver>) {
    const payload: Record<string, unknown> = {...updates};
    if (updates.birthday) payload.birthday = updates.birthday.valueOf();
    return update(child(this.driversRef, driver.$key), payload);
  }

  getDriver(key: string): Observable<Driver> {
    return objectVal<Driver>(child(this.driversRef, key), {keyField: '$key'});
  }

  getAllVehicles(): Observable<Vehicle[]> {
    return listVal<Vehicle>(this.vehiclesRef, {keyField: '$key'}).pipe(
      map(Utility.sortByDisplayName),
      tap(ds => ds.forEach(d => {
        if (d.latestInspection) d.latestInspection = new Date(d.latestInspection as unknown as number);
        d.isRutebus ??= false;
      })),
      // See getAllDrivers's shareReplay above — same rationale, same duplicate-listener fix.
      shareReplay({bufferSize: 1, refCount: true}),
    );
  }

  addVehicle(displayName: string, brand: string, regNo: string, latestInspection: Moment | null, isRutebus: boolean) {
    const vehicle = {
      displayName,
      brand,
      regNo,
      latestInspection: (latestInspection) ? latestInspection.valueOf() : null,
      isRutebus,
      deleted: false
    };
    return push(this.vehiclesRef, vehicle);
  }

  deleteVehicle(vehicle: Vehicle) {
    return update(child(this.vehiclesRef, vehicle.$key), {deleted: true});
  }

  updateVehicle(vehicle: Vehicle, updates: Partial<NewVehicle>) {
    const payload: Record<string, unknown> = {...updates};
    if (updates.latestInspection) payload.latestInspection = updates.latestInspection.valueOf();
    return update(child(this.vehiclesRef, vehicle.$key), payload);
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
    return Promise.all([
      remove(ref(db, `/tripsInTemplate/${template.$key}`)),
      remove(child(this.templatesRef, template.$key)),
    ]);
  }

  addTripToTemplate(template: Template, trip: NewTrip) {
    const tripsInTemplateRef = ref(db, `/tripsInTemplate/${template.$key}`);
    return push(tripsInTemplateRef, {
      start: trip.start.valueOf(),
      end: (trip.end) ? trip.end.valueOf() : null,
      name: trip.name,
      description: trip.description || '',
      officeDescription: trip.officeDescription || '',
      labels: trip.labels || [],
      drivers: trip.drivers || [],
      vehicles: trip.vehicles || []
    });
  }

  updateTripFromTemplate(template: Template, trip: Trip, updates: Partial<NewTrip>) {
    const payload: Record<string, unknown> = {...updates};
    if (updates.start) payload.start = updates.start.valueOf();
    if (updates.end) payload.end = updates.end.valueOf();
    const tripsInTemplateRef = ref(db, `/tripsInTemplate/${template.$key}`);
    return update(child(tripsInTemplateRef, trip.$key), payload);
  }

  removeTripFromTemplate(template: Template, trip: Trip) {
    return remove(ref(db, `/tripsInTemplate/${template.$key}/${trip.$key}`));
  }

  insertTemplate(date: Moment, templateKey: string) {
    const tripsInTemplateRef = ref(db, `/tripsInTemplate/${templateKey}`);
    listVal<Trip>(tripsInTemplateRef, {keyField: '$key'}).pipe(first()).subscribe(trips => {
      trips.forEach(t => {
        if (t.start) {
          t.start = moment(t.start as unknown as number);
          Utility.copyDate(date, t.start);
        }
        if (t.end) {
          t.end = moment(t.end as unknown as number);
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
        t.start = moment(t.start as unknown as number);
        t.end = (t.end) ? moment(t.end as unknown as number) : null;
      }))
    );
  }

  // Notes are low-volume (a handful of vacations/shop visits at a time) compared to trips, so
  // unlike getTrips there's no windowed query here — every caller just fetches all of them and
  // filters client-side for whichever date(s) it cares about.
  getAllNotes(): Observable<Note[]> {
    return listVal<Note>(this.notesRef, {keyField: '$key'}).pipe(
      tap(ns => ns.forEach(n => {
        n.start = this.dateUtility.getDate(moment(n.start as unknown as number));
        n.end = this.dateUtility.getDate(moment(n.end as unknown as number));
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

  updateNote(note: Note, updates: Partial<NewNote>) {
    const payload: Record<string, unknown> = {...updates};
    if (updates.start) payload.start = updates.start.valueOf();
    if (updates.end) payload.end = updates.end.valueOf();
    return update(child(this.notesRef, note.$key), payload);
  }

  removeNote(note: Note) {
    return remove(child(this.notesRef, note.$key));
  }
}
