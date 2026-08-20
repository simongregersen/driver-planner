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
import moment from 'moment';
import {firstValueFrom} from 'rxjs';
import {DataStore} from './data.service';
import {Template} from './template';
import {Trip} from './trip';
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
      'notificationQueue'].map(node => asOwner(node, null)));
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
      const ref = await store.addDriver('Anna', 'Anna Jensen', at('00:00'));

      const driver = await firstValueFrom(store.getDriver(ref.key!));

      expect(driver?.displayName).toBe('Anna');
      expect(moment.isMoment(driver?.birthday)).toBe(true);
      expect(driver?.deleted).toBe(false);
    }, 30000);

    it('reads a driver saved without a birthday as null', async () => {
      const ref = await store.addDriver('Bo', 'Bo Nielsen', null);

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

  describe('drivers', () => {
    it('creates, lists, updates and soft-deletes', async () => {
      await store.addDriver('Anna', 'Anna Jensen', at('00:00'));

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
      await store.addDriver('Yrsa', 'Yrsa', null);
      await store.addDriver('Anna', 'Anna', null);

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
      const driverRef = await store.addDriver('Anna', 'Anna', null);
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
