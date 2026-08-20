import moment from 'moment';
import {toTrip, TripRecord} from './trip';
import {StoredClockRecord, toClockRecord} from './clock-record';
import {FuelReportRecord, toFuelReport} from './fuel-report';
import {TankRefillRecord, toTankRefill} from './tank-refill';
import {DriverRecord, toDriver} from './driver';
import {toVehicle, VehicleRecord} from './vehicle';
import {NoteRecord, toNote} from './note';

/**
 * The record→domain mappers, exercised against the shape the database really returns.
 *
 * The case every one of these suites leads with is the *sparse* record: a node with nothing but
 * its key. That isn't a hypothetical — RTDB has no representation for an empty array, an empty
 * object or null, so a trip saved with no drivers, no vehicles and no end genuinely comes back
 * as little more than `{start, name}`. test/integration/storage-shape.spec.mjs proves that
 * against a real emulator; these specs are the other half of the contract, verifying that the
 * mappers turn such a record into an object matching what the domain types promise.
 *
 * This is the regression lock for the bug that motivated the split: `drivers`/`vehicles` were
 * absent on read while Trip declared them as `string[]`, and the resulting `undefined.length`
 * surfaced only when saving an edit to a trip with no vehicle assigned. Any future field that
 * gets the same treatment fails here instead.
 */

/** The extreme the database can actually produce: a key and nothing else. */
const BARE = {$key: 'k1'};

describe('toTrip', () => {
  it('gives a bare record every field Trip promises', () => {
    const trip = toTrip(BARE as TripRecord);

    // The two that caused the production bug. Not `toBeDefined` — the type says string[], so an
    // array is the contract, and `.length`/`.filter`/`for..of` on it must all be safe.
    expect(trip.drivers).toEqual([]);
    expect(trip.vehicles).toEqual([]);
    expect(() => trip.drivers.length + trip.vehicles.length).not.toThrow();

    expect(trip.$key).toBe('k1');
    expect(trip.name).toBe('');
    expect(trip.end).toBeNull();
    expect(moment.isMoment(trip.start)).toBe(true);
  });

  it('does not read a missing start as "now"', () => {
    // moment(undefined) is the current time, which would make a malformed record look like a
    // trip happening today rather than an obviously broken one.
    expect(toTrip(BARE as TripRecord).start.valueOf()).toBe(0);
  });

  it('converts the stored numbers into moments', () => {
    const trip = toTrip({$key: 'k1', start: 1700000000000, end: 1700003600000, modified: 1700007200000} as TripRecord);

    expect(trip.start.valueOf()).toBe(1700000000000);
    expect(trip.end?.valueOf()).toBe(1700003600000);
    expect(trip.modified?.valueOf()).toBe(1700007200000);
  });

  it('maps read receipts, defaulting dismissed to false', () => {
    const trip = toTrip({$key: 'k1', reads: {d1: {at: 1700000060000, version: 1700000000000}}} as TripRecord);

    // `dismissed` is absent on every receipt a driver writes — RTDB stores `false` but the
    // client never sends the key at all — so the default here is the ordinary case, not the
    // malformed one. It has to be `false` and not undefined: Min dag branches on it to decide
    // whether to tell the driver they saw this.
    expect(trip.reads?.['d1'].dismissed).toBe(false);
    expect(trip.reads?.['d1'].version).toBe(1700000000000);
    expect(moment.isMoment(trip.reads?.['d1'].at)).toBe(true);
  });

  it('keeps an office-written receipt marked as dismissed', () => {
    const trip = toTrip({$key: 'k1', reads: {d1: {at: 1, version: 2, dismissed: true}}} as TripRecord);

    expect(trip.reads?.['d1'].dismissed).toBe(true);
  });

  it('reads a receipt with no version as matching nothing', () => {
    // 0 is unmatchable by construction — a trip with no `modified` accepts no receipts at all —
    // so a malformed record reads as "not seen" rather than as a receipt for whatever version
    // the trip happens to carry now.
    const trip = toTrip({$key: 'k1', reads: {d1: {}}} as TripRecord);

    expect(trip.reads?.['d1'].version).toBe(0);
  });

  it('leaves modified undefined rather than epoch when the trip was never edited', () => {
    // Distinct from start/end: `modified` genuinely is absent on most trips, and the UI's
    // "recently modified" highlight keys off its presence.
    expect(toTrip(BARE as TripRecord).modified).toBeUndefined();
  });

  it('keeps the arrays it is actually given', () => {
    const trip = toTrip({$key: 'k1', drivers: ['d1', 'd2'], vehicles: ['v1']} as TripRecord);

    expect(trip.drivers).toEqual(['d1', 'd2']);
    expect(trip.vehicles).toEqual(['v1']);
  });

  it('converts every report in the nested map', () => {
    const trip = toTrip({
      $key: 'k1',
      reports: {
        d1: {start: 1700000000000, startKm: 100, note: 'kørt'},
        d2: {end: 1700003600000},
      },
    } as TripRecord);

    expect(Object.keys(trip.reports ?? {})).toEqual(['d1', 'd2']);
    expect(trip.reports?.['d1'].start?.valueOf()).toBe(1700000000000);
    expect(trip.reports?.['d1'].startKm).toBe(100);
    expect(trip.reports?.['d2'].start).toBeNull();
  });

  it('gives a sparse report the flags and note its type promises', () => {
    const report = toTrip({$key: 'k1', reports: {d1: {}}} as TripRecord).reports?.['d1'];

    expect(report?.note).toBe('');
    expect(report?.startFromCustomer).toBe(false);
    expect(report?.endFromCustomer).toBe(false);
    expect(report?.startKm).toBeNull();
    expect(report?.endKm).toBeNull();
  });

  it('leaves reports undefined when the trip has none', () => {
    expect(toTrip(BARE as TripRecord).reports).toBeUndefined();
  });

  it('does not invent office fields, which are not stored on the trip', () => {
    // officeDescription/labels live in the admin-only /tripOffice side table and are merged in
    // afterwards by DataStore.attachOffice. Defaulting them here would make a driver's trip look
    // like it had been checked for office notes when it never was.
    const trip = toTrip(BARE as TripRecord);

    expect(trip.officeDescription).toBeUndefined();
    expect(trip.labels).toBeUndefined();
  });
});

describe('toNote', () => {
  it('gives a bare record the arrays Note promises', () => {
    const note = toNote(BARE as NoteRecord);

    expect(note.drivers).toEqual([]);
    expect(note.vehicles).toEqual([]);
    expect(note.text).toBe('');
  });

  it('truncates both ends to the start of their day', () => {
    // A note's range is in whole days; the time component of the stored value is meaningless and
    // would otherwise make an inclusive end-of-range comparison drop the final day.
    const note = toNote({$key: 'k1', start: moment('2026-03-05 14:30').valueOf(), end: moment('2026-03-07 22:15').valueOf()} as NoteRecord);

    expect(note.start.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-03-05 00:00:00');
    expect(note.end.format('YYYY-MM-DD HH:mm:ss')).toBe('2026-03-07 00:00:00');
  });
});

describe('toClockRecord', () => {
  it('reads an absent clockOut as an open record, not as the epoch', () => {
    const record = toClockRecord({$key: 'k1', clockIn: 1700000000000} as StoredClockRecord);

    expect(record.clockOut).toBeNull();
    expect(record.clockIn.valueOf()).toBe(1700000000000);
  });

  it('converts a closed record', () => {
    const record = toClockRecord({$key: 'k1', clockIn: 1700000000000, clockOut: 1700003600000, dognbetaling: true} as StoredClockRecord);

    expect(record.clockOut?.valueOf()).toBe(1700003600000);
    expect(record.dognbetaling).toBe(true);
  });
});

describe('toDriver', () => {
  it('gives a bare record every field Driver promises', () => {
    const driver = toDriver(BARE as DriverRecord);

    expect(driver.displayName).toBe('');
    expect(driver.name).toBe('');
    expect(driver.birthday).toBeNull();
    expect(driver.deleted).toBe(false);
  });

  it('preserves a stored deleted: true', () => {
    // The one that must never be defaulted the wrong way: a soft-deleted driver reappearing in
    // every picker would be a silent data problem rather than a crash.
    expect(toDriver({$key: 'k1', deleted: true} as DriverRecord).deleted).toBe(true);
  });

  it('converts a birthday to a moment', () => {
    expect(toDriver({$key: 'k1', birthday: 1700000000000} as DriverRecord).birthday?.valueOf()).toBe(1700000000000);
  });
});

describe('toVehicle', () => {
  it('gives a bare record every field Vehicle promises', () => {
    const vehicle = toVehicle(BARE as VehicleRecord);

    expect(vehicle.latestInspection).toBeNull();
    expect(vehicle.isRutebus).toBe(false);
    expect(vehicle.deleted).toBe(false);
    expect(vehicle.regNo).toBe('');
  });

  it('converts latestInspection to a Date, not a Moment', () => {
    // Vehicle.latestInspection is a Date because the vehicle form's datepicker is not on the
    // Moment adapter — converting it to a Moment here would break that field silently.
    const vehicle = toVehicle({$key: 'k1', latestInspection: 1700000000000} as VehicleRecord);

    expect(vehicle.latestInspection).toBeInstanceOf(Date);
    expect(vehicle.latestInspection?.getTime()).toBe(1700000000000);
  });
});

describe('toFuelReport', () => {
  it('gives a bare record every field FuelReport promises', () => {
    const report = toFuelReport(BARE as FuelReportRecord);

    expect(report.driverKey).toBe('');
    expect(report.odometerKm).toBe(0);
    expect(report.liters).toBe(0);
  });

  it('keeps a stored zero rather than defaulting it away', () => {
    // `?? 0` and `|| 0` agree on this input, but only `??` keeps a genuine 0 distinguishable
    // from an absent field everywhere else in these mappers — see the same case for `false`.
    const report = toFuelReport({$key: 'k1', odometerKm: 0, liters: 0} as FuelReportRecord);

    expect(report.odometerKm).toBe(0);
    expect(report.liters).toBe(0);
  });
});

describe('toTankRefill', () => {
  it('gives a bare record every field TankRefill promises', () => {
    const refill = toTankRefill(BARE as TankRefillRecord);

    expect(refill.liters).toBe(0);
    expect(refill.price).toBe(0);
    expect(moment.isMoment(refill.date)).toBe(true);
  });
});

describe('every mapper', () => {
  /** Fields the domain types declare with `?`, so undefined is the correct answer for them. */
  const OPTIONAL_BY_DESIGN = [
    'description', 'officeDescription', 'labels', 'vehicleAssignments', 'modified',
    'multiDayStart', 'reports', 'reads', 'note', 'dognbetaling', 'uid', 'email',
    'excludeFromStatistics',
  ];

  // A guard against the failure mode that produced the original bug: a field added to a domain
  // type, and to the write path, but forgotten on the read path. TypeScript already catches an
  // outright missing key, but not one filled in as `undefined` — this catches that too.
  const cases: [string, () => object][] = [
    ['toTrip', () => toTrip(BARE as TripRecord)],
    ['toNote', () => toNote(BARE as NoteRecord)],
    ['toClockRecord', () => toClockRecord(BARE as StoredClockRecord)],
    ['toDriver', () => toDriver(BARE as DriverRecord)],
    ['toVehicle', () => toVehicle(BARE as VehicleRecord)],
    ['toFuelReport', () => toFuelReport(BARE as FuelReportRecord)],
    ['toTankRefill', () => toTankRefill(BARE as TankRefillRecord)],
  ];

  it.each(cases)('%s survives a record carrying nothing but its key', (_name, map) => {
    const result = map() as Record<string, unknown>;

    expect(result['$key']).toBe('k1');
    // Anything left undefined must be genuinely optional on the domain type. The mappers list
    // every field explicitly, so a key present-but-undefined here means a default was forgotten.
    for (const [field, value] of Object.entries(result)) {
      if (value === undefined) {
        expect(OPTIONAL_BY_DESIGN).toContain(field);
      }
    }
  });
});
