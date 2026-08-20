import {Injectable, inject} from '@angular/core';
import {child, endAt, endBefore, get, limitToLast, orderByChild, orderByKey, push, query, Query, ref, remove, startAt, update} from 'firebase/database';
import {listVal, objectVal} from 'rxfire/database';
import {NewTrip, Trip, TripOffice, TripRecord, TripReport, toTrip} from './trip';
import {ClockRecord, StoredClockRecord, toClockRecord} from './clock-record';
import {FuelReport, FuelReportRecord, NewFuelReport, toFuelReport} from './fuel-report';
import {NewTankRefill, TankRefill, TankRefillRecord, toTankRefill} from './tank-refill';
import {Driver, DriverRecord, NewDriver, toDriver} from './driver';
import {AppUser} from './user';
import {combineLatest, firstValueFrom, from as observableFrom, Observable, of, Subject} from 'rxjs';
import {first, map, shareReplay, startWith, switchMap, timeout} from 'rxjs/operators';
import {NewVehicle, toVehicle, Vehicle, VehicleRecord} from './vehicle';
import {DateUtility} from './date-utility';
import {Utility} from './utility';
import {Template} from './template';
import {NewNote, Note, NoteRecord, toNote} from './note';
import {db} from './firebase';
import {Moment} from 'moment';
import moment from 'moment';
import {NotificationDispatchService} from './notification-dispatch.service';

// How far back getTrips looks for a multi-day trip via its own multiDayStart-indexed query (see
// below) — trips lasting more than 1-2 weeks are very uncommon, so this is a generous margin
// past that, not a tight fit. A multi-day trip starting further back than this would silently
// stop appearing on its later days once it's this far in the past.
const MULTI_DAY_LOOKBACK_DAYS = 30;

// How long isDayPublicNow waits for /public before assuming "not public" and letting the trip
// write proceed regardless — see its own comment. Generous enough that a merely slow connection
// still gets the right answer, short enough that an offline save isn't left hanging.
const PUBLIC_LOOKUP_TIMEOUT_MS = 3000;

@Injectable({providedIn: 'root'})
export class DataStore {
  private driversRef = ref(db, '/drivers');
  private vehiclesRef = ref(db, '/vehicles');
  private tripsRef = ref(db, '/trips');
  private clockRecordsRef = ref(db, '/clockRecords');
  private fuelReportsRef = ref(db, '/fuelReports');
  private tankRefillsRef = ref(db, '/tankRefills');
  private templatesRef = ref(db, '/templates');
  private publicRef = ref(db, '/public');
  private usersRef = ref(db, '/users');
  private notificationQueueRef = ref(db, '/notificationQueue');
  private notesRef = ref(db, '/notes');
  private tripOfficeRef = ref(db, '/tripOffice');

  private readonly dateUtility = inject(DateUtility);
  private readonly notificationDispatch = inject(NotificationDispatchService);

  // getTripsWithOffice's re-read of /tripOffice normally rides on the /trips listener firing (see
  // that method's comment), but that listener only fires on an actual value change — and
  // updateTrip only stamps `modified` (guaranteeing one) on a public day. On a non-public day, an
  // edit that touches only officeDescription/labels can leave every /trips field byte-for-byte
  // identical, so the listener never re-fires and the freshly written office fields never get
  // re-read. This subject is the fallback trigger for exactly that case — see its .next() in
  // updateTrip.
  private officeUpdated$ = new Subject<void>();

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

    const inWindow$ = listVal<TripRecord>(
      query(this.tripsRef, orderByChild('start'), startAt(fromDate.valueOf()), endAt(toDate.valueOf() - 1)),
      {keyField: '$key'}
    );
    const multiDayLookback = fromDate.clone().subtract(MULTI_DAY_LOOKBACK_DAYS, 'days');
    const multiDay$ = listVal<TripRecord>(
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
      //   Merged as raw records rather than after conversion — mergeTripWindows only ever looks
      // at $key — so toTrip runs once per trip instead of once per query hit, with the duplicate
      // a multi-day trip makes across both windows dropped before it is paid for.
      map(([inWindow, multiDay]) => Utility.mergeTripWindows(inWindow, multiDay)),
      map(rs => rs.map(toTrip).filter(t => Utility.tripOverlaps(t, fromDate, toDate)))
    );
  }

  // getTrips plus the admin-only officeDescription/labels merged back onto each trip, for the
  // pages that actually show them (Day Plans, Period Plans). Kept separate from getTrips rather
  // than folded into it because /tripOffice is admin-only: a driver's session issuing this query
  // would simply fail with permission_denied, and every driver-facing caller (My Day, Timeseddel)
  // has no use for these fields anyway.
  //
  // /tripOffice is a pure lookup-by-key side table: getTrips has already done the windowing, so
  // the exact set of keys needed is known before this reads anything. It is deliberately NOT
  // range-queried — doing so would mean mirroring the trip's start (and, to keep the multi-day
  // lookback from scanning every ordinary record, its multiDayStart too) into every office
  // record purely to be sortable, and then keeping those copies in step on every date change
  // forever. That's an ongoing correctness obligation whose failure mode is silent: a drifted
  // mirror makes office notes vanish from a plan, or surface on the wrong day, with nothing to
  // signal it. Fetching by key needs no sort keys, no index, and no synchronisation at all.
  //
  // The reads are one-shot rather than listeners, and that's sufficient rather than a compromise:
  // office fields are only ever written by the trip editor, which writes the trip in the same
  // multi-path update (see updateTrip), so the trip listener firing is itself the signal to
  // re-read. A record is absent for every trip with no note and no labels — the common case —
  // which keeps both this node and these reads small.
  getTripsWithOffice(from: Moment, to?: Moment): Observable<Trip[]> {
    return combineLatest([
      this.getTrips(from, to),
      this.officeUpdated$.pipe(startWith(undefined)),
    ]).pipe(
      map(([trips]) => trips),
      switchMap(trips => trips.length ? observableFrom(this.attachOffice(trips)) : of([] as Trip[])),
    );
  }

  private async attachOffice(trips: Trip[]): Promise<Trip[]> {
    const offices = await Promise.all(
      trips.map(t => get(child(this.tripOfficeRef, t.$key)).then(s => s.val() as TripOffice | null)),
    );
    return trips.map((trip, i) => {
      const office = offices[i];
      return office ? {...trip, officeDescription: office.officeDescription, labels: office.labels ?? []} : trip;
    });
  }

  // Mirrors updateTrip's own public-day check: a trip landing on a day that's already public is
  // just as much news to whoever already saw that day's plan as an edit to an existing trip
  // would be, so it gets the same `modified` stamp (and the same "recently modified" highlight —
  // see TripsComponent.isRecentlyModified) rather than looking indistinguishable from a trip
  // that was there all along.
  addTrip(trip: NewTrip) {
    return this.isDayPublicNow(trip.start).then(async isPublic => {
      // push() with no value only reserves a key — nothing is written until the update() below.
      // That's what lets the trip and its admin-only half go in as one atomic multi-path write,
      // rather than as two writes that could leave a trip with no /tripOffice entry (or vice
      // versa) if the second one failed.
      const tripRef = push(this.tripsRef);
      const key = tripRef.key!;
      await update(ref(db), {
        [`/trips/${key}`]: {
          start: trip.start.valueOf(),
          end: (trip.end) ? trip.end.valueOf() : null,
          name: trip.name,
          description: trip.description || '',
          drivers: trip.drivers || [],
          vehicles: trip.vehicles || [],
          vehicleAssignments: trip.vehicleAssignments || {},
          multiDayStart: this.multiDayStart(trip.start, trip.end),
          ...(isPublic ? {modified: moment().valueOf()} : {}),
        },
        [`/tripOffice/${key}`]: this.tripOfficePayload(trip.officeDescription, trip.labels),
      });
      if (isPublic) {
        this.enqueueTripChangeNotification(trip.drivers, trip.name, trip.start, 'Der er tilføjet en ny tur');
      }
      return tripRef;
    });
  }

  // The /tripOffice half of a trip — just the two admin-only fields, keyed by trip. It carries no
  // copy of the trip's dates because it is never sorted or range-queried (see
  // getTripsWithOffice), so there is nothing here that has to be kept in step with the trip.
  //
  // Returns null — which Firebase writes as a delete — when there is neither a note nor a label,
  // so a trip without office data leaves no record at all. That keeps the node roughly as sparse
  // as actual office use, and it means clearing the last note removes the record rather than
  // leaving an empty one behind.
  private tripOfficePayload(officeDescription?: string, labels?: string[]) {
    const note = officeDescription || '';
    const tags = labels || [];
    if (!note && !tags.length) return null;
    return {officeDescription: note, labels: tags};
  }

  updateTrip(trip: Trip, updates: Partial<NewTrip>) {
    // Gates on the destination day (updates.start is always populated by the trip editor on every submit),
    // so this reflects where the trip ends up, not where it was before the edit.
    const effectiveStart: Moment = updates.start || trip.start;
    // officeDescription/labels live under /tripOffice now, not on the trip — strip them out of
    // the trip payload and route them into their own multi-path entry below.
    const {officeDescription, labels, ...tripUpdates} = updates;
    const payload: Record<string, unknown> = {...tripUpdates};
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
    // The trip editor's save always resubmits every field, changed or not, so the presence of a
    // field in `updates` doesn't mean it actually differs from `trip` — an office-only edit (just
    // officeDescription/labels) still carries the untouched start/end/name/description/drivers/
    // vehicles along with it. Compared against `trip` here so that an edit touching only the
    // admin-only half doesn't read as trip "news": no modified stamp, no highlight, no
    // notification, since nothing a driver can see actually changed.
    const tripContentChanged = this.tripContentChanged(trip, updates);
    return this.isDayPublicNow(effectiveStart).then(isPublic => {
      const isNews = isPublic && tripContentChanged;
      if (isNews) payload.modified = moment().valueOf();

      // One multi-path update so the trip and its office half can never diverge. Keys are
      // written as `/trips/$key/$field` rather than as whole objects, to preserve update()'s
      // merge semantics — writing `/trips/$key` wholesale would delete every field the caller
      // didn't mention, including the driver-written `reports` subtree.
      const paths: Record<string, unknown> = {};
      for (const [field, value] of Object.entries(payload)) {
        paths[`/trips/${trip.$key}/${field}`] = value;
      }
      // Only touched when the editor actually changed one of the two office fields. Moving a
      // trip to another day no longer has to rewrite this record, because nothing in it depends
      // on the trip's dates any more.
      if (officeDescription !== undefined || labels !== undefined) {
        paths[`/tripOffice/${trip.$key}`] = this.tripOfficePayload(
          officeDescription ?? trip.officeDescription,
          labels ?? trip.labels,
        );
      }

      return update(ref(db), paths).then(() => {
        if (officeDescription !== undefined || labels !== undefined) {
          this.officeUpdated$.next();
        }
        if (isNews) {
          this.enqueueTripChangeNotification(updates.drivers || trip.drivers, trip.name, trip.start);
        }
      });
    });
  }

  // Whether `updates` actually changes any field a driver can see — as opposed to just
  // officeDescription/labels, which live in the admin-only /tripOffice side table (see
  // TripOffice) and are invisible to drivers. Needed because the trip editor's save always
  // resubmits every field regardless of whether it changed (see updateTrip above), so a field's
  // mere presence in `updates` doesn't imply a real change.
  private tripContentChanged(trip: Trip, updates: Partial<NewTrip>): boolean {
    if (updates.start !== undefined && updates.start.valueOf() !== trip.start.valueOf()) return true;
    if (updates.end !== undefined && (updates.end?.valueOf() ?? null) !== (trip.end?.valueOf() ?? null)) return true;
    if (updates.name !== undefined && updates.name !== trip.name) return true;
    if (updates.description !== undefined && (updates.description || '') !== (trip.description || '')) return true;
    if (updates.drivers !== undefined && !this.sameMembers(updates.drivers, trip.drivers)) return true;
    if (updates.vehicles !== undefined && !this.sameMembers(updates.vehicles, trip.vehicles)) return true;
    if (updates.vehicleAssignments !== undefined && !this.sameAssignments(updates.vehicleAssignments, trip.vehicleAssignments)) return true;
    return false;
  }

  // Undefined-tolerant on both sides for the same reason sameAssignments below is. toTrip now
  // guarantees these arrays on anything read through this service, so this is defence in depth
  // rather than the fix — but it is what turns the failure mode of a Trip arriving from some
  // future path without them from a thrown TypeError mid-save into a correct comparison.
  private sameMembers(a: string[] | undefined, b: string[] | undefined): boolean {
    const sortedA = [...(a ?? [])].sort();
    const sortedB = [...(b ?? [])].sort();
    return sortedA.length === sortedB.length && sortedA.every((v, i) => v === sortedB[i]);
  }

  private sameAssignments(a: Record<string, string> | undefined, b: Record<string, string> | undefined): boolean {
    const entriesA = Object.entries(a ?? {}).sort();
    const entriesB = Object.entries(b ?? {}).sort();
    return entriesA.length === entriesB.length && entriesA.every(([k, v], i) => k === entriesB[i][0] && v === entriesB[i][1]);
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
    return Utility.multiDayStartValue(start, end);
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
    return listVal<StoredClockRecord>(q, {keyField: '$key'}).pipe(map(rs => rs.map(toClockRecord)));
  }

  addClockRecord(driverKey: string, clockIn: Moment, note?: string | null, clockOut?: Moment | null, dognbetaling?: boolean) {
    return push(child(this.clockRecordsRef, driverKey), {clockIn: clockIn.valueOf(), clockOut: clockOut ? clockOut.valueOf() : null, note: note || null, dognbetaling: dognbetaling || null});
  }

  updateClockRecord(driverKey: string, record: ClockRecord, updates: {clockIn?: Moment; clockOut?: Moment | null; note?: string | null; dognbetaling?: boolean}) {
    const payload: Record<string, unknown> = {};
    if (updates.clockIn) payload.clockIn = updates.clockIn.valueOf();
    if ('clockOut' in updates) payload.clockOut = updates.clockOut ? updates.clockOut.valueOf() : null;
    if ('note' in updates) payload.note = updates.note || null;
    if ('dognbetaling' in updates) payload.dognbetaling = updates.dognbetaling || null;
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
      reports.push(toFuelReport({...(child.val() as FuelReportRecord), $key: child.key!}));
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

  // Deliberately separate from updateFuelReport, which backs the shared create/edit dialog
  // used by both roles — this is the only path that ever writes excludeFromStatistics, called
  // solely from FuelTrackingComponent's admin-only table, and database.rules.json's own
  // .validate rule on that field rejects the write outright if it isn't an admin doing it.
  setFuelReportExcluded(vehicleKey: string, record: FuelReport, excluded: boolean) {
    return update(child(this.fuelReportsRef, `${vehicleKey}/${record.$key}`), {excludeFromStatistics: excluded || null});
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

  // Admin-only (see database.rules.json) — a flat collection, unlike fuelReports, since there's
  // only one company tank rather than one per vehicle.
  getTankRefills(from: Moment, to: Moment): Observable<TankRefill[]> {
    const fromDate = this.dateUtility.toMoment(from)!;
    const q = query(this.tankRefillsRef, orderByChild('date'), startAt(fromDate.valueOf()), endAt(this.dateUtility.toMoment(to)!.add(1, 'days').valueOf() - 1));
    return observableFrom(this.fetchTankRefills(q));
  }

  private async fetchTankRefills(q: Query): Promise<TankRefill[]> {
    const snapshot = await get(q);
    const refills: TankRefill[] = [];
    snapshot.forEach(child => {
      refills.push(toTankRefill({...(child.val() as TankRefillRecord), $key: child.key!}));
    });
    return refills;
  }

  addTankRefill(refill: NewTankRefill) {
    return push(this.tankRefillsRef, {
      date: refill.date.valueOf(),
      liters: refill.liters,
      price: refill.price,
    });
  }

  updateTankRefill(record: TankRefill, updates: Partial<NewTankRefill>) {
    const payload: Record<string, unknown> = {...updates};
    if (updates.date) payload.date = updates.date.valueOf();
    return update(child(this.tankRefillsRef, record.$key), payload);
  }

  removeTankRefill(record: TankRefill) {
    return remove(child(this.tankRefillsRef, record.$key));
  }

  // Removes the trip and its /tripOffice half together, so deleting a trip can't leave an
  // orphaned office record behind — which would otherwise accumulate invisibly and, worse,
  // re-attach itself to a future trip that happened to reuse the key.
  removeTrip(trip: Trip) {
    return update(ref(db), {
      [`/trips/${trip.$key}`]: null,
      [`/tripOffice/${trip.$key}`]: null,
    });
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
    tripKeys.forEach(k => {
      updates[`/trips/${k}`] = null;
      // Same pairing as removeTrip — the retention cleanup would otherwise prune trips while
      // leaving their office halves behind forever, which is exactly the data it's meant to be
      // deleting.
      updates[`/tripOffice/${k}`] = null;
    });
    return update(ref(db), updates);
  }

  // One shared listener on the whole /public node, rather than a fresh per-date listener each
  // time a day's publication state is needed. /public is a flat map of 'YYYY-MM-DD' -> true and
  // is pruned to a year by the cleanup page, so it's a few hundred booleans at most — cheaper to
  // hold once than to attach and tear down a child listener per date change. Sharing it also
  // means isDayPublicNow below is usually answered straight from cache, which is what makes a
  // trip save on an already-open plan page independent of the network.
  private readonly publicDates$: Observable<string[]> = objectVal<Record<string, boolean> | null>(this.publicRef).pipe(
    map(dates => Object.keys(dates || {})),
    shareReplay({bufferSize: 1, refCount: true}),
  );

  private isDayPublic(date: Moment): Observable<boolean> {
    const key = this.dateUtility.dateKey(date);
    return this.publicDates$.pipe(map(keys => keys.includes(key)));
  }

  // Never let a trip write block on this read. A Realtime Database listener on a path that isn't
  // already cached emits nothing at all while offline — it doesn't error, it just stays silent —
  // so an un-raced firstValueFrom here would never settle. Because addTrip/updateTrip issue their
  // push()/update() *inside* the .then(), that meant the trip was neither written nor queued into
  // the SDK's own offline buffer, and the still-live promise chain would then fire the write
  // minutes later once the connection returned, landing a phantom duplicate on a day the admin
  // had long since given up on. Falling back to "not public" costs only the `modified` stamp and
  // its notification; blocking costs the trip itself.
  private isDayPublicNow(date: Moment): Promise<boolean> {
    return firstValueFrom(
      this.isDayPublic(date).pipe(timeout({first: PUBLIC_LOOKUP_TIMEOUT_MS, with: () => of(false)})),
    );
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
    return this.publicDates$;
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

  // Deliberately returns deleted drivers too, matching getAllVehicles below — filtering is the
  // caller's job, because the two kinds of caller want opposite things. A *picker* (the trip
  // form's driver select, the chip filters, the Chauffører page) must exclude them, and each of
  // those applies Utility.filterDeleted itself. A *name lookup* (the plan table's driver chips,
  // the printed day plan, a driver's own trip report, conflict warnings) must still resolve
  // them: soft-deleting a driver doesn't unassign them from the trips they're already on, so
  // filtering here meant TripsComponent.getDriver() returned undefined and every one of those
  // trips — past ones in the archive and future ones already planned — rendered a blank chip and
  // an empty Chauffører column on the sheet handed to drivers, with no warning at delete time.
  // --- Retention cleanup (see CleanupComponent) -------------------------------------------
  //
  // Clock records are stored per driver and notes are a single flat collection, so unlike
  // getTripsOlderThan these can't be answered by one range query — clock records need one per
  // driver. All are one-shot get()s rather than listeners: this runs once when an admin presses
  // the button, and attaching live listeners to the entire history would be pointless.

  // Working-time records older than the cutoff, across every driver. Returns paths rather than
  // keys because they're nested per driver, so a single multi-path delete needs the full path.
  async getClockRecordPathsOlderThan(cutoff: Moment): Promise<string[]> {
    const drivers = await firstValueFrom(this.getAllDrivers());
    const paths: string[] = [];
    await Promise.all(drivers.map(async driver => {
      const q = query(child(this.clockRecordsRef, driver.$key), orderByChild('clockIn'), endBefore(cutoff.valueOf()));
      const snapshot = await get(q);
      snapshot.forEach(record => {
        paths.push(`${driver.$key}/${record.key}`);
      });
    }));
    return paths;
  }

  removeClockRecordPaths(paths: string[]): Promise<void> {
    if (!paths.length) return Promise.resolve();
    const updates: Record<string, null> = {};
    paths.forEach(p => { updates[p] = null; });
    return update(this.clockRecordsRef, updates);
  }

  // Notes have no index (they're low-volume and always read in full — see getAllNotes), so this
  // filters client-side on `end`: a note is spent once the absence it describes has passed.
  async getNoteKeysOlderThan(cutoff: Moment): Promise<string[]> {
    const snapshot = await get(this.notesRef);
    const keys: string[] = [];
    snapshot.forEach(note => {
      const end = note.child('end').val() as number | null;
      if (typeof end === 'number' && end < cutoff.valueOf()) keys.push(note.key!);
    });
    return keys;
  }

  removeNotes(noteKeys: string[]): Promise<void> {
    if (!noteKeys.length) return Promise.resolve();
    const updates: Record<string, null> = {};
    noteKeys.forEach(k => { updates[k] = null; });
    return update(this.notesRef, updates);
  }

  // Fuel reports are keyed by vehicle, so same shape as clock records above.
  async getFuelReportPathsOlderThan(cutoff: Moment): Promise<string[]> {
    const vehicles = await firstValueFrom(this.getAllVehicles());
    const paths: string[] = [];
    await Promise.all(vehicles.map(async vehicle => {
      const q = query(child(this.fuelReportsRef, vehicle.$key), orderByChild('date'), endBefore(cutoff.valueOf()));
      const snapshot = await get(q);
      snapshot.forEach(report => {
        paths.push(`${vehicle.$key}/${report.key}`);
      });
    }));
    return paths;
  }

  removeFuelReportPaths(paths: string[]): Promise<void> {
    if (!paths.length) return Promise.resolve();
    const updates: Record<string, null> = {};
    paths.forEach(p => { updates[p] = null; });
    return update(this.fuelReportsRef, updates);
  }

  getAllDrivers(): Observable<Driver[]> {
    return listVal<DriverRecord>(this.driversRef, {keyField: '$key'}).pipe(
      map(rs => Utility.sortByDisplayName(rs.map(toDriver))),
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

  // Null for a key with no record — objectVal emits the absence rather than erroring, and a
  // driver whose record has since been removed is a real case (see UserService.driverProfile$,
  // whose uid → driverId mapping can outlive the driver). Previously typed as a bare Driver,
  // which also meant birthday was left as the raw number it is stored as; toDriver settles both.
  getDriver(key: string): Observable<Driver | null> {
    return objectVal<DriverRecord | null>(child(this.driversRef, key), {keyField: '$key'}).pipe(
      map(record => record ? toDriver(record) : null),
    );
  }

  getAllVehicles(): Observable<Vehicle[]> {
    return listVal<VehicleRecord>(this.vehiclesRef, {keyField: '$key'}).pipe(
      map(rs => Utility.sortByDisplayName(rs.map(toVehicle))),
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

  // Null for a missing key, and converted rather than raw — same as getDriver above.
  getVehicle(key: string): Observable<Vehicle | null> {
    return objectVal<VehicleRecord | null>(child(this.vehiclesRef, key), {keyField: '$key'}).pipe(
      map(record => record ? toVehicle(record) : null),
    );
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
      vehicles: trip.vehicles || [],
      vehicleAssignments: trip.vehicleAssignments || {}
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

  // Resolves once every trip in the template has actually been written, with the keys of what
  // was created — so the caller can report "12 ture indsat", surface a failure, and offer an
  // undo. This previously subscribed, looped addTrip() discarding every promise, and returned
  // void, which left the caller with nothing to await: no spinner, no success message, and a
  // partially-inserted template if any of the writes failed.
  async insertTemplate(date: Moment, templateKey: string): Promise<string[]> {
    const tripsInTemplateRef = ref(db, `/tripsInTemplate/${templateKey}`);
    const records = await firstValueFrom(listVal<TripRecord>(tripsInTemplateRef, {keyField: '$key'}).pipe(first()));
    const refs = await Promise.all(records.map(record => {
      // The template stores each trip's own start/end; only their time-of-day carries over, with
      // the date replaced by the day being inserted into.
      const trip = toTrip(record);
      Utility.copyDate(date, trip.start);
      if (trip.end) Utility.copyDate(date, trip.end);
      return this.addTrip(trip);
    }));
    return refs.map(r => r.key!).filter(Boolean);
  }

  getTemplateTrips(template: Template): Observable<Trip[]> {
    const q = query(ref(db, `/tripsInTemplate/${template.$key}`), orderByChild('start'));
    return listVal<TripRecord>(q, {keyField: '$key'}).pipe(map(rs => rs.map(toTrip)));
  }

  // Notes are low-volume (a handful of vacations/shop visits at a time) compared to trips, so
  // unlike getTrips there's no windowed query here — every caller just fetches all of them and
  // filters client-side for whichever date(s) it cares about.
  getAllNotes(): Observable<Note[]> {
    return listVal<NoteRecord>(this.notesRef, {keyField: '$key'}).pipe(
      map(rs => rs.map(toNote)),
      // Day Plans and My Trips both subscribe to this on the same page load, and it's an
      // unwindowed read of the whole node — see getAllDrivers's shareReplay for the same
      // rationale.
      shareReplay({bufferSize: 1, refCount: true}),
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
