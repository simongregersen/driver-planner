/**
 * DataStore driven against a real Realtime Database emulator.
 *
 * The other specs each cover one half of the data layer and neither can see the seam between
 * them: record-mappers.spec.ts proves toTrip and friends are correct in isolation, and
 * database-rules.spec.mjs proves the security rules accept the payloads the app claims to send.
 * Nothing proved that DataStore's own read pipelines actually *run* those mappers, or that a
 * write it composes survives a round-trip through the database and comes back usable.
 *
 * That seam is exactly where the production bug lived. Every individual piece was correct; the
 * read pipeline just didn't normalize what the database returned, and the resulting undefined
 * only became a crash three layers later, on save. Deleting the `.map(toTrip)` from getTrips
 * today would still pass every unit test in this repo — but not this file.
 *
 * Excluded from `npm test` (see angular.json's test target) because it needs the emulators. Run
 * it with `npm run test:integration`, which starts them for the duration of the run.
 */
import {TestBed} from '@angular/core/testing';
import {createUserWithEmailAndPassword} from 'firebase/auth';
import {goOffline} from 'firebase/database';
import moment, {Moment} from 'moment';
import {firstValueFrom} from 'rxjs';
import {DataStore, DAY_PLAN_OVERNIGHT_HOURS} from './data.service';
import {clockRecordTotals, payPeriodFor, payPeriodKeyOf} from './pay-period';
import {Template} from './template';
import {Trip} from './trip';
import {Utility} from './utility';
import {auth, db} from './firebase';

// No mocking anywhere in here, deliberately. src/app/firebase.ts connects to the emulators by
// itself whenever environment.useEmulators is set (it is, in the development environment this
// target builds against), and firebase.test.json runs them on exactly the ports it reaches for.
// So this spec drives the same Firebase instance the running app does, which is the point: a
// stubbed database would re-introduce the gap between what we assume storage does and what it
// actually does — the gap the original bug lived in.
const DB_REST = 'http://localhost:9000';

/** Writes straight past the security rules, for seeding and teardown only. */
async function asOwner(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${DB_REST}/${path}.json?ns=driver-planner`, {
    method: body === null ? 'DELETE' : 'PUT',
    headers: {Authorization: 'Bearer owner', 'Content-Type': 'application/json'},
    body: body === null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`seed ${path} failed: ${res.status} ${await res.text()}`);
}

/** Reads a node exactly as stored, bypassing the SDK — for asserting on the raw shape. */
async function rawAt(path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${DB_REST}/${path}.json?ns=driver-planner`, {headers: {Authorization: 'Bearer owner'}});
  return res.json();
}

/**
 * Retries an assertion until it holds, or gives up and rethrows the last failure.
 *
 * Needed wherever a fixture is seeded over REST and then read back through the SDK. The SDK keeps
 * a local cache of every node it has listened to, and a write arriving by another channel reaches
 * that cache only when the server pushes it — so firstValueFrom can legitimately take an emission
 * from *before* the seed. That made one assertion here fail perhaps one run in five.
 *
 * Only for that cross-channel case. An assertion about a write DataStore itself made needs no
 * retry: the SDK applies those to its own cache synchronously.
 */
async function eventually(assertion: () => Promise<void> | void, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (err) {
      if (Date.now() >= deadline) throw err;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

const DAY = moment('2026-04-15', 'YYYY-MM-DD');
const at = (hhmm: string) => moment(`2026-04-15 ${hhmm}`, 'YYYY-MM-DD HH:mm');

describe('DataStore against the emulator', () => {
  let store: DataStore;

  beforeAll(async () => {
    try {
      const ping = await fetch(`${DB_REST}/.json?ns=driver-planner`, {headers: {Authorization: 'Bearer owner'}});
      if (!ping.ok) throw new Error(`HTTP ${ping.status}`);
    } catch (err) {
      throw new Error(
        `No database emulator on ${DB_REST}. Run these with \`npm run test:integration\`, which starts one.`,
        {cause: err},
      );
    }
    // Signed in as an admin, because that is the role that edits trips — so these tests exercise
    // the same rules a real session does rather than a privileged back door.
    const cred = await createUserWithEmailAndPassword(auth, `admin-${Date.now()}@test.local`, 'password123');
    await asOwner(`users/${cred.user.uid}`, {role: 'admin'});
  }, 30000);

  afterAll(async () => {
    // Several reads are live listeners held open by shareReplay; without this the SDK's socket
    // keeps the worker alive after the run finishes.
    goOffline(db);
  });

  // Everything except /users, which holds the admin role this session signed in with.
  beforeEach(async () => {
    await Promise.all(['trips', 'tripOffice', 'notes', 'drivers', 'vehicles', 'templates',
      'tripsInTemplate', 'clockRecords', 'fuelReports', 'tankRefills', 'public',
      'notificationQueue', 'paidPeriods'].map(node => asOwner(node, null)));
    TestBed.configureTestingModule({});
    store = TestBed.inject(DataStore);
  });

  /** The trip DataStore just wrote, read back through the pipeline under test. */
  async function onlyTrip(): Promise<Trip> {
    const [trip] = await firstValueFrom(store.getTripsWithOffice(DAY));
    return trip;
  }

  async function seedTrip(overrides: Partial<Parameters<DataStore['addTrip']>[0]> = {}): Promise<Trip> {
    await store.addTrip({
      start: at('08:00'), end: at('10:00'), name: 'Tur',
      drivers: [], vehicles: [], vehicleAssignments: {}, ...overrides,
    });
    return onlyTrip();
  }

  describe('trips with nothing assigned — the shape that caused the bug', () => {
    it('reads drivers and vehicles back as arrays, not as undefined', async () => {
      await store.addTrip({
        start: at('08:00'), end: at('10:00'), name: 'Tur uden folk',
        drivers: [], vehicles: [], vehicleAssignments: {},
      });

      const [trip] = await firstValueFrom(store.getTrips(DAY));

      // The database genuinely returned nothing for either key — assert that first, so a failure
      // below can't be mistaken for the emulator having stored [] after all.
      const stored = await rawAt(`trips/${trip.$key}`);
      expect(stored?.['drivers']).toBeUndefined();
      expect(stored?.['vehicles']).toBeUndefined();

      // ...and the read pipeline is what makes them arrays again.
      expect(trip.drivers).toEqual([]);
      expect(trip.vehicles).toEqual([]);
    }, 30000);

    it('adding a label to a trip with no vehicle assigned succeeds', async () => {
      // The exact reported failure: the editor resubmits every field, so `vehicles: []` meets an
      // absent stored value inside tripContentChanged. Before the fix this rejected with
      // "can't access property length".
      await store.addTrip({
        start: at('08:00'), end: at('10:00'), name: 'Tur', drivers: [], vehicles: [], vehicleAssignments: {},
      });
      const [trip] = await firstValueFrom(store.getTrips(DAY));

      await expect(store.updateTrip(trip, {
        start: at('08:00'), end: at('10:00'), name: 'Tur', description: '',
        drivers: [], vehicles: [], vehicleAssignments: {}, labels: ['Skole'],
      })).resolves.not.toThrow();

      const office = await rawAt(`tripOffice/${trip.$key}`);
      expect(office?.['labels']).toEqual(['Skole']);
    }, 30000);

    it('reads back a trip that does have people on it', async () => {
      await store.addTrip({
        start: at('08:00'), end: at('10:00'), name: 'Tur med folk',
        drivers: ['d1', 'd2'], vehicles: ['v1'], vehicleAssignments: {d1: 'v1'},
      });

      const [trip] = await firstValueFrom(store.getTrips(DAY));

      expect(trip.drivers).toEqual(['d1', 'd2']);
      expect(trip.vehicles).toEqual(['v1']);
      expect(trip.vehicleAssignments).toEqual({d1: 'v1'});
    }, 30000);

    it('returns moments for the dates, not the numbers they are stored as', async () => {
      await store.addTrip({
        start: at('08:00'), end: at('10:00'), name: 'Tur', drivers: [], vehicles: [], vehicleAssignments: {},
      });

      const [trip] = await firstValueFrom(store.getTrips(DAY));

      expect(moment.isMoment(trip.start)).toBe(true);
      expect(trip.start.format('YYYY-MM-DD HH:mm')).toBe('2026-04-15 08:00');
      expect(trip.end?.format('HH:mm')).toBe('10:00');
    }, 30000);

    it('reads a trip with no end as null rather than as a date', async () => {
      await store.addTrip({
        start: at('08:00'), end: null, name: 'Tur', drivers: [], vehicles: [], vehicleAssignments: {},
      });

      const [trip] = await firstValueFrom(store.getTrips(DAY));

      expect(trip.end).toBeNull();
    }, 30000);
  });

  describe('office fields', () => {
    it('merges labels back on for getTripsWithOffice but not for getTrips', async () => {
      await store.addTrip({
        start: at('08:00'), end: at('10:00'), name: 'Tur', drivers: [], vehicles: [],
        vehicleAssignments: {}, officeDescription: 'Husk nøgle', labels: ['Skole'],
      });

      const [withOffice] = await firstValueFrom(store.getTripsWithOffice(DAY));
      expect(withOffice.officeDescription).toBe('Husk nøgle');
      expect(withOffice.labels).toEqual(['Skole']);

      // The plain read is what a driver's session uses, and must not carry the admin-only half.
      const [plain] = await firstValueFrom(store.getTrips(DAY));
      expect(plain.officeDescription).toBeUndefined();
      expect(plain.labels).toBeUndefined();
    }, 30000);
  });

  describe('notes', () => {
    it('reads drivers and vehicles back as arrays', async () => {
      await store.addNote({
        start: DAY, end: DAY.clone().add(2, 'days'), text: 'Ferie', drivers: [], vehicles: [],
      });

      const [note] = await firstValueFrom(store.getAllNotes());

      expect(note.drivers).toEqual([]);
      expect(note.vehicles).toEqual([]);
      expect(note.text).toBe('Ferie');
      expect(note.start.format('YYYY-MM-DD')).toBe('2026-04-15');
    }, 30000);
  });

  describe('single-entity reads', () => {
    it('gives null for a driver key with no record', async () => {
      expect(await firstValueFrom(store.getDriver('does-not-exist'))).toBeNull();
    }, 30000);

    it('converts a stored driver, birthday included', async () => {
      const ref = await store.addDriver('Anna', 'Anna Jensen', at('00:00'), false);

      const driver = await firstValueFrom(store.getDriver(ref.key!));

      expect(driver?.displayName).toBe('Anna');
      expect(moment.isMoment(driver?.birthday)).toBe(true);
      expect(driver?.deleted).toBe(false);
    }, 30000);

    it('reads a driver saved without a birthday as null', async () => {
      const ref = await store.addDriver('Bo', 'Bo Nielsen', null, false);

      expect((await firstValueFrom(store.getDriver(ref.key!)))?.birthday).toBeNull();
    }, 30000);

    it('converts a vehicle inspection date to a Date', async () => {
      const ref = await store.addVehicle('Bus 1', 'Volvo', 'AB12345', at('00:00'), false);

      const vehicle = await firstValueFrom(store.getVehicle(ref.key!));

      expect(vehicle?.latestInspection).toBeInstanceOf(Date);
      expect(vehicle?.isRutebus).toBe(false);
    }, 30000);

    it('gives null for a vehicle key with no record', async () => {
      expect(await firstValueFrom(store.getVehicle('does-not-exist'))).toBeNull();
    }, 30000);
  });

  describe('clock records', () => {
    it('reads an open record as clockOut: null', async () => {
      await store.addClockRecord('d1', at('08:00'));

      const [record] = await firstValueFrom(store.getClockRecords('d1', DAY, DAY));

      expect(record.clockOut).toBeNull();
      expect(record.clockIn.format('HH:mm')).toBe('08:00');
    }, 30000);

    it('reads a closed record with both ends as moments', async () => {
      await store.addClockRecord('d2', at('08:00'), 'n', at('16:00'), true);

      const [record] = await firstValueFrom(store.getClockRecords('d2', DAY, DAY));

      expect(record.clockOut?.format('HH:mm')).toBe('16:00');
      expect(record.dognbetaling).toBe(true);
    }, 30000);

    // The overview table's fan-out. A clock record carries no driver key of its own — the path it
    // was read from is the only thing that ties it to one — so the attaching this does is what
    // makes the records sortable into per-driver rows at all.
    it('reads several drivers at once, tagging each record with whose it is', async () => {
      await store.addClockRecord('d1', at('08:00'), null, at('16:00'));
      await store.addClockRecord('d2', at('09:00'), null, at('17:00'));

      const drivers = [
        {$key: 'd1', displayName: 'Kim', name: 'Kim', birthday: null, deleted: false, external: false},
        {$key: 'd2', displayName: 'Bente', name: 'Bente', birthday: null, deleted: false, external: false},
      ];
      const records = await firstValueFrom(store.getClockRecordsForDrivers(drivers, DAY, DAY));

      expect(records.map(r => r.driverKey).sort()).toEqual(['d1', 'd2']);
      expect(records.find(r => r.driverKey === 'd1')!.clockIn.format('HH:mm')).toBe('08:00');
    }, 30000);

    it('reads no drivers at all as an empty list rather than hanging', async () => {
      expect(await firstValueFrom(store.getClockRecordsForDrivers([], DAY, DAY))).toEqual([]);
    }, 30000);

    // The overview and day-by-day views bucket a record by where it *ends* (see pay-period.ts's
    // assignmentMoment), so a window's own query has to catch a shift that started before it but
    // ends inside it too — not just one that started inside it. getClockRecords is indexed on
    // clockIn alone, so this only works because it widens its own lower bound by
    // CLOCK_RECORD_LOOKBACK_DAYS before querying.
    it('finds a record whose clock-in precedes the window but whose clock-out falls inside it', async () => {
      const clockIn = DAY.clone().subtract(3, 'days').hour(22);
      const clockOut = DAY.clone().hour(6);
      await store.addClockRecord('d1', clockIn, null, clockOut);

      const [record] = await firstValueFrom(store.getClockRecords('d1', DAY, DAY));

      expect(record.clockOut?.format('YYYY-MM-DD HH:mm')).toBe(clockOut.format('YYYY-MM-DD HH:mm'));
    }, 30000);

    it('still excludes a record entirely outside the widened lookback window', async () => {
      const farClockIn = DAY.clone().subtract(20, 'days').hour(8);
      const farClockOut = DAY.clone().subtract(19, 'days').hour(16);
      await store.addClockRecord('d1', farClockIn, null, farClockOut);

      expect(await firstValueFrom(store.getClockRecords('d1', DAY, DAY))).toEqual([]);
    }, 30000);

    // The end-to-end version of the widened-query tests above: a boundary-crossing shift must be
    // *fetched* by both the period it began in (so that one can render its muted echo) and the
    // period it ended in (so that one can count it) — but payPeriodKeyOf must only ever agree
    // with one of them, so the hours land in exactly one place, never both and never neither.
    // Each half of this is covered separately elsewhere (the widened query itself above; the
    // bucketing math in pay-period.spec.ts; each component's own rendering in their specs) — this
    // is the one test that exercises the real query and the real bucketing rule together.
    it('fetches a period-boundary-crossing shift on both sides, but counts it only where it ended', async () => {
      const originPeriod = payPeriodFor(DAY);
      const destinationPeriod = payPeriodFor(originPeriod.end.clone().add(1, 'day'));
      const clockIn = originPeriod.end.clone().hour(22);
      const clockOut = destinationPeriod.start.clone().hour(6);
      await store.addClockRecord('d1', clockIn, null, clockOut);

      const [originRecords, destinationRecords] = await Promise.all([
        firstValueFrom(store.getClockRecords('d1', originPeriod.start, originPeriod.end)),
        firstValueFrom(store.getClockRecords('d1', destinationPeriod.start, destinationPeriod.end)),
      ]);

      // Fetched on both sides of the boundary...
      expect(originRecords.length).toBe(1);
      expect(destinationRecords.length).toBe(1);

      // ...but payPeriodKeyOf claims it for the destination period alone.
      expect(originRecords.filter(r => payPeriodKeyOf(r) === originPeriod.key)).toEqual([]);
      const countedInDestination = destinationRecords.filter(r => payPeriodKeyOf(r) === destinationPeriod.key);
      expect(countedInDestination.length).toBe(1);

      // And its full duration lands exactly once — not split, not doubled.
      expect(clockRecordTotals(countedInDestination).minutes).toBe(clockOut.diff(clockIn, 'minutes'));
    }, 30000);

    // The flip side of the lookback test above, spelled out as a known limitation rather than an
    // untested assumption: a shift that started further back than CLOCK_RECORD_LOOKBACK_DAYS
    // before the period it ends in is invisible to that period's query. It would still render as
    // a muted echo in the period it began (its clockIn is found there regardless), but nowhere
    // would count it — pinned here so shortening the lookback, or a business need for longer
    // shifts, is a deliberate choice rather than a silent regression.
    it('cannot find a boundary-crossing shift that started further back than the lookback window', async () => {
      const destinationPeriod = payPeriodFor(DAY);
      const clockIn = destinationPeriod.start.clone().subtract(28, 'days').hour(22);
      const clockOut = destinationPeriod.start.clone().hour(6);
      await store.addClockRecord('d1', clockIn, null, clockOut);

      const destinationRecords = await firstValueFrom(store.getClockRecords('d1', destinationPeriod.start, destinationPeriod.end));

      expect(destinationRecords).toEqual([]);
    }, 30000);
  });

  // The "Udbetalt" marks behind the admin overview. Stored as a bare `true` keyed by driver and
  // pay-period start, like /public — so what matters is that a key's presence and absence both
  // survive the round trip, and that unsetting removes the key rather than writing a false.
  describe('paid pay periods', () => {
    it('marks, lists and clears a period', async () => {
      expect(await firstValueFrom(store.getPaidPeriods())).toEqual([]);

      await store.setPeriodPaid('d1', '2026-08-03', true);
      await store.setPeriodPaid('d2', '2026-07-20', true);

      expect((await firstValueFrom(store.getPaidPeriods())).sort())
        .toEqual(['d1/2026-08-03', 'd2/2026-07-20']);

      await store.setPeriodPaid('d1', '2026-08-03', false);

      expect(await firstValueFrom(store.getPaidPeriods())).toEqual(['d2/2026-07-20']);
    }, 30000);

    it('stores nothing but the key itself', async () => {
      await store.setPeriodPaid('d1', '2026-08-03', true);

      expect(await rawAt('paidPeriods/d1')).toEqual({'2026-08-03': true});
    }, 30000);

    // Clearing the last mark for a driver leaves RTDB with no node at all under that driver,
    // which getPaidPeriods has to read as "none" rather than tripping over.
    it('reads a driver whose every mark has been cleared as having none', async () => {
      await store.setPeriodPaid('d1', '2026-08-03', true);
      await store.setPeriodPaid('d1', '2026-08-03', false);

      expect(await firstValueFrom(store.getPaidPeriods())).toEqual([]);
      expect(await rawAt('paidPeriods')).toBeNull();
    }, 30000);

    // Live, like clock records and fuel reports: the table stays in step with a mark set from the
    // period dialog stacked on top of it, without the dialog having to report back.
    it('pushes a new mark to an already-open subscription', async () => {
      const seen: string[][] = [];
      const sub = store.getPaidPeriods().subscribe(keys => seen.push(keys));
      try {
        await eventually(() => expect(seen).toEqual([[]]));

        await store.setPeriodPaid('d1', '2026-08-03', true);

        await eventually(() => expect(seen.at(-1)).toEqual(['d1/2026-08-03']));
      } finally {
        sub.unsubscribe();
      }
    }, 30000);
  });

  describe('fuel reports', () => {
    it('round-trips a report, zero readings included', async () => {
      await store.addFuelReport('v1', {date: at('09:00'), driverKey: 'd1', odometerKm: 0, liters: 0});

      const reports = await firstValueFrom(store.getFuelReports('v1', DAY, DAY));

      expect(reports).toHaveLength(1);
      expect(reports[0].odometerKm).toBe(0);
      expect(reports[0].liters).toBe(0);
      expect(moment.isMoment(reports[0].date)).toBe(true);
    }, 30000);
  });

  describe('trips — the rest of the lifecycle', () => {
    it('updates the fields a driver can see', async () => {
      const trip = await seedTrip();

      await store.updateTrip(trip, {
        start: at('09:30'), end: at('11:30'), name: 'Omlagt tur', description: 'ny beskrivelse',
        drivers: ['d1'], vehicles: ['v1'], vehicleAssignments: {},
      });

      const updated = await onlyTrip();
      expect(updated.name).toBe('Omlagt tur');
      expect(updated.description).toBe('ny beskrivelse');
      expect(updated.start.format('HH:mm')).toBe('09:30');
      expect(updated.drivers).toEqual(['d1']);
    }, 30000);

    it('clears an office note back to nothing rather than leaving an empty record', async () => {
      const trip = await seedTrip({officeDescription: 'Husk nøgle', labels: ['Skole']});
      expect(await rawAt(`tripOffice/${trip.$key}`)).not.toBeNull();

      await store.updateTrip(trip, {officeDescription: '', labels: []});

      // tripOfficePayload returns null for "neither note nor label", which Firebase writes as a
      // delete — so the sparse /tripOffice node stays as sparse as actual office use.
      expect(await rawAt(`tripOffice/${trip.$key}`)).toBeNull();
    }, 30000);

    it('removes a trip and its office half together', async () => {
      const trip = await seedTrip({officeDescription: 'Note'});

      await store.removeTrip(trip);

      expect(await rawAt(`trips/${trip.$key}`)).toBeNull();
      expect(await rawAt(`tripOffice/${trip.$key}`)).toBeNull();
      expect(await firstValueFrom(store.getTrips(DAY))).toEqual([]);
    }, 30000);

    it('finds and bulk-removes trips older than a cutoff, office halves included', async () => {
      const old = await seedTrip({officeDescription: 'gammel'});

      const stale = await firstValueFrom(store.getTripsOlderThan(DAY.clone().add(1, 'day')));
      expect(stale.map(t => t.$key)).toContain(old.$key);

      await store.removeTrips(stale.map(t => t.$key));
      expect(await rawAt(`trips/${old.$key}`)).toBeNull();
      expect(await rawAt(`tripOffice/${old.$key}`)).toBeNull();
    }, 30000);

    it('keeps a driver-written report through an edit of the trip around it', async () => {
      const trip = await seedTrip({drivers: ['d1']});
      await store.setTripReport(trip.$key, 'd1', {
        start: at('08:05'), startFromCustomer: true, end: at('09:55'), endFromCustomer: true,
        startKm: 100, startKmFromCustomer: false, endKm: 180, endKmFromCustomer: false, note: 'fint',
      });

      await store.updateTrip(trip, {name: 'Nyt navn', drivers: ['d1'], vehicles: [], vehicleAssignments: {}});

      const after = await onlyTrip();
      expect(after.name).toBe('Nyt navn');
      // The multi-path write addresses individual fields precisely so it cannot clobber this.
      expect(after.reports?.['d1'].startKm).toBe(100);
      expect(after.reports?.['d1'].start?.format('HH:mm')).toBe('08:05');
    }, 30000);

    it('deletes a single report without touching the trip', async () => {
      const trip = await seedTrip({drivers: ['d1']});
      await store.setTripReport(trip.$key, 'd1', {
        start: null, startFromCustomer: true, end: null, endFromCustomer: true,
        startKm: null, startKmFromCustomer: false, endKm: null, endKmFromCustomer: false, note: 'kun note',
      });

      await store.deleteTripReport(trip.$key, 'd1');

      const after = await onlyTrip();
      expect(after.reports).toBeUndefined();
      expect(after.name).toBe('Tur');
    }, 30000);
  });

  // A day's plan reaches DAY_PLAN_OVERNIGHT_HOURS past its own midnight (Min dag, Dagsplaner), so
  // a trip leaving at 01:00 is planned on the evening it continues rather than backdated to 23:59
  // to make it land on a page a driver would look at. The boundary itself is the whole feature —
  // and it lives in an RTDB range query, where an off-by-one is invisible until a trip silently
  // stops appearing — so it is pinned here against the real database rather than in a unit test.
  describe('the overnight tail of a day plan', () => {
    const nextDayAt = (hhmm: string) => moment(`2026-04-16 ${hhmm}`, 'YYYY-MM-DD HH:mm');

    async function namesFor(overnightHours: number): Promise<string[]> {
      const trips = await firstValueFrom(store.getTrips(DAY, DAY, overnightHours));
      return trips.map(t => t.name);
    }

    async function seedAt(start: Moment, name: string): Promise<void> {
      await store.addTrip({start, end: null, name, drivers: [], vehicles: [], vehicleAssignments: {}});
    }

    it('reaches into the small hours of the next morning, and stops there', async () => {
      await seedAt(at('22:00'), 'aften');
      await seedAt(nextDayAt('01:00'), 'natten');
      await seedAt(nextDayAt('02:59'), 'lige inden for');
      await seedAt(nextDayAt('03:30'), 'uden for');

      // Ordered by start, so this also says the tail lands at the foot of the day rather than
      // anywhere in the middle of it.
      expect(await namesFor(DAY_PLAN_OVERNIGHT_HOURS)).toEqual(['aften', 'natten', 'lige inden for']);
    }, 30000);

    it('leaves a plain day query at midnight, as every report period still needs', async () => {
      await seedAt(at('22:00'), 'aften');
      await seedAt(nextDayAt('01:00'), 'natten');

      expect(await namesFor(0)).toEqual(['aften']);
    }, 30000);
  });

  describe('public days', () => {
    it('publishes, reads back, and unpublishes a day', async () => {
      expect(await firstValueFrom(store.getDayPublic(DAY))).toBe(false);

      await store.setDayPublic(DAY, true);
      expect(await firstValueFrom(store.getDayPublic(DAY))).toBe(true);
      expect(await firstValueFrom(store.getPublicDates())).toContain('2026-04-15');

      await store.setDayPublic(DAY, false);
      expect(await firstValueFrom(store.getDayPublic(DAY))).toBe(false);
    }, 30000);

    it('lists published days within a range and prunes old ones', async () => {
      await store.setDayPublic(DAY, true);
      await store.setDayPublic(DAY.clone().add(10, 'days'), true);

      const inRange = await firstValueFrom(store.getPublicDatesInRange(DAY, DAY.clone().add(2, 'days')));
      expect(inRange).toEqual(['2026-04-15']);

      const stale = await firstValueFrom(store.getPublicDatesOlderThan(DAY.clone().add(5, 'days')));
      expect(stale).toEqual(['2026-04-15']);

      await store.removePublicDates(stale);
      expect(await firstValueFrom(store.getPublicDates())).toEqual(['2026-04-25']);
    }, 30000);

    it('stamps a trip added to an already-published day as news, and queues a notification', async () => {
      // The whole notification feature hangs off this: a trip is only "news" on a day drivers
      // have already been shown, and only then does anything reach /notificationQueue for the
      // poller to send.
      // A driverId of its own rather than the shared 'd1': /users is the one node beforeEach
      // leaves alone (it holds this session's admin role), so anything seeded there by another
      // spec is still present, and a shared id would sweep those drivers into the assertion.
      await asOwner('users/notify-me', {role: 'driver', driverId: 'notify-driver'});
      // enqueueTripChangeNotification resolves uids by reading /users through the SDK, so the
      // seed above has to have reached the SDK's cache before the trip is added.
      await eventually(async () => {
        expect((await firstValueFrom(store.getAllUsers()))['notify-me']).toBeDefined();
      });
      await store.setDayPublic(DAY, true);

      await store.addTrip({start: at('08:00'), end: at('10:00'), name: 'Ny tur', drivers: ['notify-driver'], vehicles: [], vehicleAssignments: {}});

      const trip = await onlyTrip();
      expect(trip.modified).toBeDefined();

      const queued = Object.values((await rawAt('notificationQueue')) ?? {}) as Record<string, unknown>[];
      expect(queued).toHaveLength(1);
      expect(queued[0]['uids']).toEqual(['notify-me']);
      expect(queued[0]['title']).toBe('Der er tilføjet en ny tur');
      await asOwner('users/notify-me', null);
    }, 30000);

    it('does not stamp or notify for an office-only edit on a published day', async () => {
      await store.setDayPublic(DAY, true);
      const trip = await seedTrip({drivers: ['d1']});
      await asOwner('notificationQueue', null);
      const before = (await rawAt(`trips/${trip.$key}`))?.['modified'];

      await store.updateTrip(trip, {
        start: at('08:00'), end: at('10:00'), name: 'Tur', description: '',
        drivers: ['d1'], vehicles: [], vehicleAssignments: {}, labels: ['Skole'],
      });

      // Nothing a driver can see changed, so no new stamp and no push.
      expect((await rawAt(`trips/${trip.$key}`))?.['modified']).toBe(before);
      expect(await rawAt('notificationQueue')).toBeNull();
    }, 30000);
  });

  // "Aflys" rather than "Slet" (see Trip.deleted): the trip stays where the drivers on it are
  // looking, struck through, instead of disappearing out from under them. The seam worth pinning
  // here is that it stays a *whole* trip in storage — reports, receipts, name and all — and that
  // the flag actually reaches, and leaves, the two read paths that disagree about it.
  describe('cancelling a trip', () => {
    /** getTrips' plan-view mode, the only one a cancelled trip is visible through. */
    async function planTrips(): Promise<Trip[]> {
      return firstValueFrom(store.getTrips(DAY, DAY, 0, true));
    }

    it('keeps the whole trip and marks it cancelled', async () => {
      await store.setDayPublic(DAY, true);
      const trip = await seedTrip({drivers: ['d1'], officeDescription: 'Husk nøgle'});

      await store.setTripCancelled(trip, true);

      const [cancelled] = await planTrips();
      expect(cancelled.deleted).toBe(true);
      // Cancelled, not blanked: a field-path write, so nothing else about the trip moved.
      expect(cancelled.name).toBe('Tur');
      expect(cancelled.start.format('HH:mm')).toBe('08:00');
      expect(await rawAt(`tripOffice/${trip.$key}`)).not.toBeNull();
    }, 30000);

    it('is news like any other change: re-stamped, and every receipt stranded', async () => {
      await store.setDayPublic(DAY, true);
      const trip = await seedTrip({drivers: ['d1']});
      const version = trip.modified!.valueOf();
      await store.markTripRead(trip.$key, 'd1', version);

      await store.setTripCancelled(trip, true);

      const [cancelled] = await planTrips();
      expect(cancelled.modified!.valueOf()).toBeGreaterThan(version);
      // The receipt survives the write, but no longer matches — so Dagsplaner's unread warning
      // now asks who has seen the cancellation, rather than who had seen the trip.
      expect(cancelled.reads?.['d1']).toBeDefined();
      expect(Utility.hasReadTrip(cancelled, 'd1')).toBe(false);
    }, 30000);

    it('notifies the drivers who were on it', async () => {
      // Its own driverId rather than the shared 'd1', for the same reason as the addTrip
      // notification test above: /users is the one node beforeEach leaves alone.
      await asOwner('users/notify-cancel', {role: 'driver', driverId: 'cancel-driver'});
      await eventually(async () => {
        expect((await firstValueFrom(store.getAllUsers()))['notify-cancel']).toBeDefined();
      });
      await store.setDayPublic(DAY, true);
      const trip = await seedTrip({drivers: ['cancel-driver']});
      await asOwner('notificationQueue', null);

      await store.setTripCancelled(trip, true);

      const queued = Object.values((await rawAt('notificationQueue')) ?? {}) as Record<string, unknown>[];
      expect(queued).toHaveLength(1);
      expect(queued[0]['uids']).toEqual(['notify-cancel']);
      expect(queued[0]['title']).toBe('Din tur er aflyst');
      await asOwner('users/notify-cancel', null);
    }, 30000);

    it('drops out of every view but the plan views', async () => {
      await store.setDayPublic(DAY, true);
      const trip = await seedTrip();

      await store.setTripCancelled(trip, true);

      // The default: a Timeseddel must not count it, and the trip editor must not warn about
      // double-booking against it.
      expect(await firstValueFrom(store.getTrips(DAY))).toEqual([]);
      expect(await firstValueFrom(store.getTripsWithOffice(DAY))).toEqual([]);
      expect((await planTrips()).map(t => t.$key)).toEqual([trip.$key]);
    }, 30000);

    it('leaves no trace of the flag once the trip is restored', async () => {
      await store.setDayPublic(DAY, true);
      const trip = await seedTrip();
      await store.setTripCancelled(trip, true);

      await store.setTripCancelled(trip, false);

      // Written as null, not false — an absent key, so the field stays as sparse as actual use
      // and a restored trip is indistinguishable from one that was never cancelled.
      expect((await rawAt(`trips/${trip.$key}`))?.['deleted']).toBeUndefined();
      expect((await onlyTrip()).deleted).toBe(false);
    }, 30000);

    it('says nothing on a day nobody can open yet', async () => {
      await store.setDayPublic(DAY, false);
      const trip = await seedTrip({drivers: ['d1']});

      await store.setTripCancelled(trip, true);

      // Same gate as addTrip/updateTrip: no audience, no news. The flag still lands, so the
      // office sees its own cancellation on the plan.
      const [cancelled] = await planTrips();
      expect(cancelled.deleted).toBe(true);
      expect(cancelled.modified).toBeUndefined();
    }, 30000);
  });

  // This spec signs in as an admin, so these writes take the admin's cascading .write on /trips
  // rather than the drivers' own carve-out — which means first-read-wins (a driver-only rule) is
  // proved in database-rules.spec.mjs, not here. What this file is for is the seam those specs
  // can't see: that a receipt DataStore composes survives the round trip and comes back through
  // toTrip as something the UI can actually use.
  describe('read receipts', () => {
    // Both helpers wait for the *observable* to agree, not just for the write to land. DataStore
    // answers "is this day public?" from one shared, replayed listener on /public (see
    // publicDates$), and addTrip consults it synchronously through isDayPublicNow — so a seed
    // issued immediately after a publication change, or immediately after beforeEach wiped the
    // node, can still be answered from the previous value. That decides whether the trip gets a
    // `modified` stamp at all, which is the entire precondition for these tests.
    async function withDayPublic(isPublic: boolean): Promise<void> {
      await store.setDayPublic(DAY, isPublic);
      await eventually(async () => {
        expect(await firstValueFrom(store.getDayPublic(DAY))).toBe(isPublic);
      });
    }

    async function publishedTrip(drivers: string[] = ['d1']): Promise<Trip> {
      await withDayPublic(true);
      return seedTrip({drivers});
    }

    async function unpublishedTrip(drivers: string[] = ['d1']): Promise<Trip> {
      await withDayPublic(false);
      return seedTrip({drivers});
    }

    it('round-trips a receipt back through the read pipeline', async () => {
      const trip = await publishedTrip();
      const version = trip.modified!.valueOf();

      await store.markTripRead(trip.$key, 'd1', version);

      const read = (await onlyTrip()).reads?.['d1'];
      expect(read?.version).toBe(version);
      expect(moment.isMoment(read?.at)).toBe(true);
      // Written by the server, so it lands near now rather than at the epoch a missing value
      // would map to.
      expect(read!.at.valueOf()).toBeGreaterThan(moment().subtract(1, 'minute').valueOf());
      expect(read?.dismissed).toBe(false);
      expect(Utility.hasReadTrip(await onlyTrip(), 'd1')).toBe(true);
    }, 30000);

    // The scope rule, enforced by the database rather than by the UI: a trip planned before its
    // day went public was never *changed*, so there is nothing anyone could have missed.
    it('refuses a receipt on a trip that was never changed after publication', async () => {
      const trip = await unpublishedTrip();
      expect(trip.modified).toBeUndefined();

      await expect(store.markTripRead(trip.$key, 'd1', 0)).rejects.toThrow();
    }, 30000);

    it('refuses a receipt for a version the trip does not have', async () => {
      const trip = await publishedTrip();

      await expect(store.markTripRead(trip.$key, 'd1', trip.modified!.valueOf() + 1)).rejects.toThrow();
    }, 30000);

    it('dismisses only the drivers named, leaving a real receipt untouched', async () => {
      const trip = await publishedTrip(['d1', 'd2']);
      const version = trip.modified!.valueOf();
      await store.markTripRead(trip.$key, 'd1', version);
      const genuineAt = (await rawAt(`trips/${trip.$key}/reads/d1`))?.['at'];

      await store.dismissTripReadWarning(trip.$key, ['d2'], version);

      const reads = (await onlyTrip()).reads!;
      expect(reads['d2'].dismissed).toBe(true);
      // The admin write cascades past the drivers' monotonic rule, so passing a driver who has
      // genuinely read the trip would silently overwrite when they read it. dismissTripReadWarning
      // is only ever handed the outstanding ones, and this is what holds that to it.
      expect(reads['d1'].dismissed).toBe(false);
      expect((await rawAt(`trips/${trip.$key}/reads/d1`))?.['at']).toBe(genuineAt);
    }, 30000);

    it('keeps receipts across an edit but strands them on the old version', async () => {
      const trip = await publishedTrip();
      const version = trip.modified!.valueOf();
      await store.markTripRead(trip.$key, 'd1', version);
      await store.dismissTripReadWarning(trip.$key, ['d2'], version);

      await store.updateTrip(await onlyTrip(), {
        start: at('08:00'), end: at('10:00'), name: 'Tur (rettet)',
        drivers: ['d1'], vehicles: [], vehicleAssignments: {},
      });

      // updateTrip writes per-field paths precisely so it cannot clobber driver-written subtrees.
      const edited = await onlyTrip();
      expect(edited.reads?.['d1']).toBeDefined();
      expect(edited.reads?.['d2']).toBeDefined();
      // Both kinds go stale together on the new version, which is what brings the warning back
      // without any separate flag to reset.
      expect(edited.modified!.valueOf()).toBeGreaterThan(version);
      expect(Utility.hasReadTrip(edited, 'd1')).toBe(false);
      expect(Utility.hasReadTrip(edited, 'd2')).toBe(false);
    }, 30000);

    // No companion delete path exists, and none is needed — the reason the receipts live on the
    // trip rather than in a side table the retention cleanup could forget.
    it('deletes receipts along with the trip', async () => {
      const trip = await publishedTrip();
      await store.markTripRead(trip.$key, 'd1', trip.modified!.valueOf());

      await store.removeTrip(trip);

      expect(await rawAt(`trips/${trip.$key}`)).toBeNull();
    }, 30000);
  });

  describe('drivers', () => {
    it('creates, lists, updates and soft-deletes', async () => {
      await store.addDriver('Anna', 'Anna Jensen', at('00:00'), false);

      const [created] = await firstValueFrom(store.getAllDrivers());
      expect(created.displayName).toBe('Anna');
      expect(created.deleted).toBe(false);

      await store.updateDriver(created, {displayName: 'Anna J', birthday: null});
      expect((await firstValueFrom(store.getDriver(created.$key)))?.displayName).toBe('Anna J');

      // Soft delete: the record stays so trips already referencing it can still resolve a name.
      await store.deleteDriver(created);
      const after = await firstValueFrom(store.getDriver(created.$key));
      expect(after).not.toBeNull();
      expect(after?.deleted).toBe(true);
    }, 30000);

    it('sorts the list by display name', async () => {
      await store.addDriver('Yrsa', 'Yrsa', null, false);
      await store.addDriver('Anna', 'Anna', null, false);

      expect((await firstValueFrom(store.getAllDrivers())).map(d => d.displayName)).toEqual(['Anna', 'Yrsa']);
    }, 30000);
  });

  describe('vehicles', () => {
    it('creates, lists, updates and soft-deletes', async () => {
      await store.addVehicle('Bus 1', 'Volvo', 'AB12345', at('00:00'), false);

      const [created] = await firstValueFrom(store.getAllVehicles());
      expect(created.regNo).toBe('AB12345');
      expect(created.latestInspection).toBeInstanceOf(Date);

      await store.updateVehicle(created, {regNo: 'CD67890', isRutebus: true});
      const updated = await firstValueFrom(store.getVehicle(created.$key));
      expect(updated?.regNo).toBe('CD67890');
      expect(updated?.isRutebus).toBe(true);

      await store.deleteVehicle(created);
      expect((await firstValueFrom(store.getVehicle(created.$key)))?.deleted).toBe(true);
    }, 30000);
  });

  describe('notes', () => {
    it('creates, updates and removes', async () => {
      await store.addNote({start: DAY, end: DAY.clone().add(2, 'days'), text: 'Ferie', drivers: ['d1'], vehicles: []});

      const [note] = await firstValueFrom(store.getAllNotes());
      expect(note.text).toBe('Ferie');
      expect(note.drivers).toEqual(['d1']);

      await store.updateNote(note, {text: 'Sygdom', end: DAY.clone().add(5, 'days')});
      const [updated] = await firstValueFrom(store.getAllNotes());
      expect(updated.text).toBe('Sygdom');
      expect(updated.end.format('YYYY-MM-DD')).toBe('2026-04-20');

      await store.removeNote(updated);
      expect(await firstValueFrom(store.getAllNotes())).toEqual([]);
    }, 30000);

    it('finds and removes notes that ended before a cutoff', async () => {
      await store.addNote({start: DAY, end: DAY.clone().add(1, 'day'), text: 'Gammel', drivers: [], vehicles: []});
      await store.addNote({start: DAY, end: DAY.clone().add(30, 'days'), text: 'Aktuel', drivers: [], vehicles: []});

      const stale = await store.getNoteKeysOlderThan(DAY.clone().add(10, 'days'));
      expect(stale).toHaveLength(1);

      await store.removeNotes(stale);
      expect((await firstValueFrom(store.getAllNotes())).map(n => n.text)).toEqual(['Aktuel']);
    }, 30000);
  });

  describe('clock records', () => {
    it('creates, closes and removes', async () => {
      await store.addClockRecord('d1', at('08:00'));

      const [open] = await firstValueFrom(store.getClockRecords('d1', DAY, DAY));
      expect(open.clockOut).toBeNull();

      await store.updateClockRecord('d1', open, {clockOut: at('16:00'), note: 'lang dag'});
      const [closed] = await firstValueFrom(store.getClockRecords('d1', DAY, DAY));
      expect(closed.clockOut?.format('HH:mm')).toBe('16:00');
      expect(closed.note).toBe('lang dag');

      await store.removeClockRecord('d1', closed);
      expect(await firstValueFrom(store.getClockRecords('d1', DAY, DAY))).toEqual([]);
    }, 30000);

    it('finds and removes records older than a cutoff, across every driver', async () => {
      const driverRef = await store.addDriver('Anna', 'Anna', null, false);
      await store.addClockRecord(driverRef.key!, at('08:00'), null, at('16:00'));

      const paths = await store.getClockRecordPathsOlderThan(DAY.clone().add(1, 'day'));
      expect(paths).toHaveLength(1);

      await store.removeClockRecordPaths(paths);
      expect(await firstValueFrom(store.getClockRecords(driverRef.key!, DAY, DAY))).toEqual([]);
    }, 30000);
  });

  describe('fuel reports', () => {
    it('creates, updates, excludes and removes', async () => {
      await store.addFuelReport('v1', {date: at('09:00'), driverKey: 'd1', odometerKm: 1000, liters: 50});

      const [report] = await firstValueFrom(store.getFuelReports('v1', DAY, DAY));
      expect(report.odometerKm).toBe(1000);
      expect(report.excludeFromStatistics).toBeUndefined();

      await store.updateFuelReport('v1', report, {liters: 55, note: 'fuld tank'});
      const [updated] = await firstValueFrom(store.getFuelReports('v1', DAY, DAY));
      expect(updated.liters).toBe(55);

      await store.setFuelReportExcluded('v1', updated, true);
      expect((await firstValueFrom(store.getFuelReports('v1', DAY, DAY)))[0].excludeFromStatistics).toBe(true);

      // Written back as null rather than false, so the flag leaves no trace once cleared.
      await store.setFuelReportExcluded('v1', updated, false);
      expect((await firstValueFrom(store.getFuelReports('v1', DAY, DAY)))[0].excludeFromStatistics).toBeUndefined();

      await store.removeFuelReport('v1', updated);
      expect(await firstValueFrom(store.getFuelReports('v1', DAY, DAY))).toEqual([]);
    }, 30000);

    // A driver picking the wrong vehicle by mistake is exactly what this is for — the vehicle is
    // fuelReports' storage key rather than a plain field (see FuelReport's doc comment), so
    // "editing" it means moving the whole record to the new vehicle's path.
    it('moves a report to a different vehicle, carrying its other fields along', async () => {
      await store.addFuelReport('v1', {date: at('09:00'), driverKey: 'd1', odometerKm: 1000, liters: 50, note: 'fuld tank'});
      const [report] = await firstValueFrom(store.getFuelReports('v1', DAY, DAY));

      await store.updateFuelReport('v1', report, {vehicleKey: 'v2', liters: 55});

      expect(await firstValueFrom(store.getFuelReports('v1', DAY, DAY))).toEqual([]);
      const [moved] = await firstValueFrom(store.getFuelReports('v2', DAY, DAY));
      expect(moved.$key).toBe(report.$key);
      expect(moved.liters).toBe(55);
      expect(moved.driverKey).toBe('d1');
      expect(moved.note).toBe('fuld tank');
    }, 30000);

    // The regression this pins: these reads were briefly one-time `get`s, so a driver's own list
    // (FuelReportingComponent) only picked up the refuelling they had just saved once something
    // re-created the component — switching tabs and back. Nothing re-subscribes here either.
    it('pushes a newly added report to an already-open subscription', async () => {
      const seen: number[][] = [];
      const sub = store.getFuelReports('v1', DAY, DAY).subscribe(rs => seen.push(rs.map(r => r.odometerKm)));
      try {
        await eventually(() => expect(seen).toEqual([[]]));

        await store.addFuelReport('v1', {date: at('09:00'), driverKey: 'd1', odometerKm: 1000, liters: 50});

        await eventually(() => expect(seen.at(-1)).toEqual([1000]));
      } finally {
        sub.unsubscribe();
      }
    }, 30000);

    it('collects reports across the fleet, tagged with the vehicle they belong to', async () => {
      await store.addVehicle('Bus 1', 'Volvo', 'AB12345', null, false);
      const vehicles = await firstValueFrom(store.getAllVehicles());
      await store.addFuelReport(vehicles[0].$key, {date: at('09:00'), driverKey: 'd1', odometerKm: 10, liters: 5});

      const rows = await firstValueFrom(store.getFuelReportsForVehicles(vehicles, DAY, DAY));

      expect(rows).toHaveLength(1);
      expect(rows[0].vehicleName).toBe('Bus 1');
      expect(rows[0].vehicleKey).toBe(vehicles[0].$key);
    }, 30000);

    it('finds the previous reading before a date, for the consumption calculation', async () => {
      await store.addFuelReport('v1', {date: at('09:00'), driverKey: 'd1', odometerKm: 100, liters: 10});
      await store.addFuelReport('v1', {date: DAY.clone().add(3, 'days'), driverKey: 'd1', odometerKm: 500, liters: 40});

      const previous = await firstValueFrom(store.getLatestFuelReportBefore('v1', DAY.clone().add(3, 'days')));
      expect(previous?.odometerKm).toBe(100);

      expect(await firstValueFrom(store.getLatestFuelReportBefore('v1', DAY))).toBeNull();
    }, 30000);

    it('finds and removes reports older than a cutoff, across every vehicle', async () => {
      const vehicleRef = await store.addVehicle('Bus 1', 'Volvo', 'AB12345', null, false);
      await store.addFuelReport(vehicleRef.key!, {date: at('09:00'), driverKey: 'd1', odometerKm: 10, liters: 5});

      const paths = await store.getFuelReportPathsOlderThan(DAY.clone().add(1, 'day'));
      expect(paths).toHaveLength(1);

      await store.removeFuelReportPaths(paths);
      expect(await firstValueFrom(store.getFuelReports(vehicleRef.key!, DAY, DAY))).toEqual([]);
    }, 30000);
  });

  describe('tank refills', () => {
    it('creates, lists, updates and removes', async () => {
      await store.addTankRefill({date: at('09:00'), liters: 2000, price: 25000});

      const [refill] = await firstValueFrom(store.getTankRefills(DAY, DAY));
      expect(refill.liters).toBe(2000);
      expect(moment.isMoment(refill.date)).toBe(true);

      await store.updateTankRefill(refill, {price: 26000});
      expect((await firstValueFrom(store.getTankRefills(DAY, DAY)))[0].price).toBe(26000);

      await store.removeTankRefill(refill);
      expect(await firstValueFrom(store.getTankRefills(DAY, DAY))).toEqual([]);
    }, 30000);

    // Live for the same reason as the fuel reports above: the Tank section used to refresh only
    // because FuelTrackingComponent re-read it by hand whenever its own dialog closed, which any
    // future write path would have had to remember to do too.
    it('pushes a newly added refill to an already-open subscription', async () => {
      const seen: number[][] = [];
      const sub = store.getTankRefills(DAY, DAY).subscribe(rs => seen.push(rs.map(r => r.liters)));
      try {
        await eventually(() => expect(seen).toEqual([[]]));

        await store.addTankRefill({date: at('09:00'), liters: 2000, price: 25000});

        await eventually(() => expect(seen.at(-1)).toEqual([2000]));
      } finally {
        sub.unsubscribe();
      }
    }, 30000);
  });

  describe('templates', () => {
    async function seedTemplate(): Promise<Template> {
      await store.addTemplate('Mandag');
      const [template] = await firstValueFrom(store.getAllTemplates());
      return template;
    }

    it('creates a template and lists it', async () => {
      const template = await seedTemplate();
      expect(template.name).toBe('Mandag');
    }, 30000);

    it('adds, updates and removes trips within a template', async () => {
      const template = await seedTemplate();
      await store.addTripToTemplate(template, {
        start: at('08:00'), end: at('10:00'), name: 'Skoletur',
        drivers: [], vehicles: [], vehicleAssignments: {},
      });

      const [templateTrip] = await firstValueFrom(store.getTemplateTrips(template));
      expect(templateTrip.name).toBe('Skoletur');
      // The same absent-array normalization has to apply here: these come from their own read
      // path, not from getTrips.
      expect(templateTrip.drivers).toEqual([]);
      expect(templateTrip.vehicles).toEqual([]);

      await store.updateTripFromTemplate(template, templateTrip, {name: 'Omdøbt', start: at('09:00')});
      const [updated] = await firstValueFrom(store.getTemplateTrips(template));
      expect(updated.name).toBe('Omdøbt');
      expect(updated.start.format('HH:mm')).toBe('09:00');

      await store.removeTripFromTemplate(template, updated);
      expect(await firstValueFrom(store.getTemplateTrips(template))).toEqual([]);
    }, 30000);

    it('inserts a template onto a day, keeping times but moving the date', async () => {
      const template = await seedTemplate();
      await store.addTripToTemplate(template, {
        start: moment('2020-01-01 08:00', 'YYYY-MM-DD HH:mm'), end: moment('2020-01-01 10:00', 'YYYY-MM-DD HH:mm'),
        name: 'Skoletur', drivers: ['d1'], vehicles: [], vehicleAssignments: {},
      });

      const keys = await store.insertTemplate(DAY, template.$key);
      expect(keys).toHaveLength(1);

      const [inserted] = await firstValueFrom(store.getTrips(DAY));
      expect(inserted.name).toBe('Skoletur');
      expect(inserted.start.format('YYYY-MM-DD HH:mm')).toBe('2026-04-15 08:00');
      expect(inserted.end?.format('HH:mm')).toBe('10:00');
      expect(inserted.drivers).toEqual(['d1']);
    }, 30000);

    // The admin-only pair kept on the template record itself rather than in /tripOffice — see
    // TemplateTripRecord. Both halves of the round trip matter: the write path always stored
    // them, but the read path mapped through toTrip, which drops them for /trips.
    it('keeps office notes and labels on a template trip across a read', async () => {
      const template = await seedTemplate();
      await store.addTripToTemplate(template, {
        start: at('08:00'), end: at('10:00'), name: 'Skoletur',
        officeDescription: 'Husk nøglen', labels: ['Fast', 'Skole'],
        drivers: [], vehicles: [], vehicleAssignments: {},
      });

      const [templateTrip] = await firstValueFrom(store.getTemplateTrips(template));
      expect(templateTrip.officeDescription).toBe('Husk nøglen');
      expect(templateTrip.labels).toEqual(['Fast', 'Skole']);
      // On the record, not in the side table: a template has no /tripOffice half at all.
      expect(await rawAt(`tripOffice/${templateTrip.$key}`)).toBeNull();
    }, 30000);

    // The destructive half of the same bug: the trip editor initializes from the Trip it is given
    // and resubmits every field on save, so a read that dropped these two fed blanks straight back
    // through updateTripFromTemplate and erased them on the first edit.
    it('does not blank office notes and labels when an edit resubmits them unchanged', async () => {
      const template = await seedTemplate();
      await store.addTripToTemplate(template, {
        start: at('08:00'), end: at('10:00'), name: 'Skoletur',
        officeDescription: 'Husk nøglen', labels: ['Fast'],
        drivers: [], vehicles: [], vehicleAssignments: {},
      });

      const [templateTrip] = await firstValueFrom(store.getTemplateTrips(template));
      // Exactly what TripFormComponent submits: every field, changed or not.
      await store.updateTripFromTemplate(template, templateTrip, {
        start: templateTrip.start, end: templateTrip.end, name: 'Omdøbt',
        description: templateTrip.description,
        officeDescription: templateTrip.officeDescription,
        labels: templateTrip.labels,
        drivers: templateTrip.drivers, vehicles: templateTrip.vehicles,
        vehicleAssignments: templateTrip.vehicleAssignments ?? {},
      });

      const [updated] = await firstValueFrom(store.getTemplateTrips(template));
      expect(updated.name).toBe('Omdøbt');
      expect(updated.officeDescription).toBe('Husk nøglen');
      expect(updated.labels).toEqual(['Fast']);
    }, 30000);

    // Insertion is where the two fields get split off onto /tripOffice, by addTrip's own atomic
    // multi-path write — the template itself keeps them inline.
    it('splits office notes and labels onto /tripOffice when a template is inserted', async () => {
      const template = await seedTemplate();
      await store.addTripToTemplate(template, {
        start: moment('2020-01-01 08:00', 'YYYY-MM-DD HH:mm'), end: moment('2020-01-01 10:00', 'YYYY-MM-DD HH:mm'),
        name: 'Skoletur', officeDescription: 'Husk nøglen', labels: ['Fast', 'Skole'],
        drivers: [], vehicles: [], vehicleAssignments: {},
      });

      const [key] = await store.insertTemplate(DAY, template.$key);

      // Not on the trip itself — a driver reading /trips must not see either field.
      const rawTrip = await rawAt(`trips/${key}`);
      expect(rawTrip?.['officeDescription']).toBeUndefined();
      expect(rawTrip?.['labels']).toBeUndefined();

      const [withOffice] = await firstValueFrom(store.getTripsWithOffice(DAY));
      expect(withOffice.officeDescription).toBe('Husk nøglen');
      expect(withOffice.labels).toEqual(['Fast', 'Skole']);
    }, 30000);

    // The sparse counterpart: a template trip with neither field must leave no /tripOffice record
    // behind at all, exactly as addTrip does for a trip created by hand.
    it('writes no /tripOffice record for an inserted trip with neither note nor labels', async () => {
      const template = await seedTemplate();
      await store.addTripToTemplate(template, {
        start: moment('2020-01-01 08:00', 'YYYY-MM-DD HH:mm'), end: null,
        name: 'Skoletur', drivers: [], vehicles: [], vehicleAssignments: {},
      });

      const [key] = await store.insertTemplate(DAY, template.$key);

      expect(await rawAt(`tripOffice/${key}`)).toBeNull();
    }, 30000);

    it('removes a template together with the trips inside it', async () => {
      const template = await seedTemplate();
      await store.addTripToTemplate(template, {
        start: at('08:00'), end: at('10:00'), name: 'Skoletur', drivers: [], vehicles: [], vehicleAssignments: {},
      });

      await store.removeTemplate(template);

      expect(await firstValueFrom(store.getAllTemplates())).toEqual([]);
      expect(await rawAt(`tripsInTemplate/${template.$key}`)).toBeNull();
    }, 30000);
  });

  describe('users', () => {
    it('lists users and promotes one to admin', async () => {
      await asOwner('users/promote-me', {role: 'driver', driverId: 'd1'});
      await eventually(async () => {
        expect((await firstValueFrom(store.getAllUsers()))['promote-me']?.role).toBe('driver');
      });

      // Both of these are DataStore's own writes, so no retry is warranted after them.
      await store.setUserAdmin('promote-me', true);
      expect((await firstValueFrom(store.getAllUsers()))['promote-me'].role).toBe('admin');

      await store.setUserAdmin('promote-me', false);
      expect((await firstValueFrom(store.getAllUsers()))['promote-me'].role).toBe('driver');
      await asOwner('users/promote-me', null);
    }, 30000);
  });
});
