import moment, {Moment} from 'moment';
import {Utility} from './utility';
import {Trip} from './trip';
import {Driver} from './driver';
import {Note} from './note';

let nextKey = 0;

function trip(overrides: Partial<Trip> = {}): Trip {
  return {
    $key: overrides.$key ?? `trip-${nextKey++}`,
    start: moment('2026-01-01 10:00', 'YYYY-MM-DD HH:mm'),
    end: moment('2026-01-01 12:00', 'YYYY-MM-DD HH:mm'),
    name: 'Trip',
    drivers: [],
    vehicles: [],
    ...overrides,
  };
}

function driver(key: string): Driver {
  return {$key: key, displayName: key, name: key, birthday: null, deleted: false};
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    $key: overrides.$key ?? `note-${nextKey++}`,
    start: moment('2026-01-01', 'YYYY-MM-DD'),
    end: moment('2026-01-05', 'YYYY-MM-DD'),
    text: 'Note',
    drivers: [],
    vehicles: [],
    ...overrides,
  };
}

// A time-of-day on 2026-01-01, matching the fixtures above — most of tripsOverlap's edge cases
// are about relative ordering of instants, not calendar dates, so every case shares one day.
const t = (hm: string): Moment => moment(`2026-01-01 ${hm}`, 'YYYY-MM-DD HH:mm');

describe('Utility.filterDeleted', () => {
  it('keeps only entries whose deleted flag is falsy', () => {
    const items = [{deleted: true}, {deleted: false}, {}];
    expect(Utility.filterDeleted(items)).toEqual([{deleted: false}, {}]);
  });
});

describe('Utility.isAssigned', () => {
  it('is true when the driver key is in trip.drivers', () => {
    expect(Utility.isAssigned(driver('d1'), trip({drivers: ['d1', 'd2']}))).toBe(true);
  });

  it('is false when the driver key is absent', () => {
    expect(Utility.isAssigned(driver('d3'), trip({drivers: ['d1', 'd2']}))).toBe(false);
  });

  it('is false when trip.drivers is missing entirely', () => {
    const bare = trip({drivers: undefined as unknown as string[]});
    expect(Utility.isAssigned(driver('d1'), bare)).toBe(false);
  });
});

describe('Utility.sortByDisplayName', () => {
  it('sorts alphabetically, numerically (so "2" sorts before "10")', () => {
    const items = [{displayName: 'Bus 10'}, {displayName: 'Bus 2'}, {displayName: 'Bus 1'}];
    expect(Utility.sortByDisplayName(items).map(i => i.displayName)).toEqual(['Bus 1', 'Bus 2', 'Bus 10']);
  });
});

describe('Utility.copyDate', () => {
  it('copies only year/month/date onto the target, leaving its own time-of-day untouched', () => {
    const from = moment('2026-03-15 08:00', 'YYYY-MM-DD HH:mm');
    const to = moment('2020-01-01 17:30', 'YYYY-MM-DD HH:mm');
    Utility.copyDate(from, to);
    expect(to.format('YYYY-MM-DD HH:mm')).toBe('2026-03-15 17:30');
  });
});

describe('Utility.sameDate', () => {
  it('is true for two moments on the same calendar day regardless of time', () => {
    expect(Utility.sameDate(t('08:00'), t('20:00'))).toBe(true);
  });

  it('is false for moments on different days', () => {
    expect(Utility.sameDate(t('08:00'), t('08:00').clone().add(1, 'day'))).toBe(false);
  });

  it('is false whenever either side is null', () => {
    expect(Utility.sameDate(null, t('08:00'))).toBe(false);
    expect(Utility.sameDate(t('08:00'), null)).toBe(false);
    expect(Utility.sameDate(null, null)).toBe(false);
  });
});

describe('Utility.tripOverlaps (window-vs-trip, half-open [start, end))', () => {
  it('is true for a trip fully inside the window', () => {
    expect(Utility.tripOverlaps(trip({start: t('10:00'), end: t('11:00')}), t('09:00'), t('12:00'))).toBe(true);
  });

  it('is true for a trip with no end that lands inside the window', () => {
    expect(Utility.tripOverlaps(trip({start: t('10:00'), end: null}), t('09:00'), t('12:00'))).toBe(true);
  });

  it('is true when the trip touches the window\'s start boundary (inclusive)', () => {
    // effectiveEnd.isSameOrAfter(start) — a trip ending exactly at the window's start still counts.
    expect(Utility.tripOverlaps(trip({start: t('08:00'), end: t('09:00')}), t('09:00'), t('12:00'))).toBe(true);
  });

  it('is false when the trip starts exactly at the window\'s end (exclusive)', () => {
    expect(Utility.tripOverlaps(trip({start: t('12:00'), end: t('13:00')}), t('09:00'), t('12:00'))).toBe(false);
  });

  it('is false for a trip entirely before the window', () => {
    expect(Utility.tripOverlaps(trip({start: t('06:00'), end: t('07:00')}), t('09:00'), t('12:00'))).toBe(false);
  });

  it('is false for a trip entirely after the window', () => {
    expect(Utility.tripOverlaps(trip({start: t('13:00'), end: t('14:00')}), t('09:00'), t('12:00'))).toBe(false);
  });
});

describe('Utility.noteAppliesToDate (inclusive date range)', () => {
  it('applies on the start date', () => {
    expect(Utility.noteAppliesToDate(note({start: t('00:00'), end: t('00:00').clone().add(4, 'days')}), t('00:00'))).toBe(true);
  });

  it('applies on the end date', () => {
    const end = t('00:00').clone().add(4, 'days');
    expect(Utility.noteAppliesToDate(note({start: t('00:00'), end}), end)).toBe(true);
  });

  it('applies somewhere in the middle', () => {
    const start = t('00:00');
    const end = start.clone().add(4, 'days');
    expect(Utility.noteAppliesToDate(note({start, end}), start.clone().add(2, 'days'))).toBe(true);
  });

  it('does not apply before the start or after the end', () => {
    const start = t('00:00');
    const end = start.clone().add(4, 'days');
    const n = note({start, end});
    expect(Utility.noteAppliesToDate(n, start.clone().subtract(1, 'day'))).toBe(false);
    expect(Utility.noteAppliesToDate(n, end.clone().add(1, 'day'))).toBe(false);
  });
});

describe('Utility.tripsOverlap (trip-vs-trip)', () => {
  it('back-to-back proper intervals (one ends exactly when the other starts) do NOT overlap', () => {
    const a = {start: t('10:00'), end: t('12:00')};
    const b = {start: t('12:00'), end: t('14:00')};
    expect(Utility.tripsOverlap(a, b)).toBe(false);
    expect(Utility.tripsOverlap(b, a)).toBe(false);
  });

  it('genuinely overlapping proper intervals do overlap', () => {
    const a = {start: t('10:00'), end: t('14:00')};
    const b = {start: t('12:00'), end: t('16:00')};
    expect(Utility.tripsOverlap(a, b)).toBe(true);
    expect(Utility.tripsOverlap(b, a)).toBe(true);
  });

  it('non-adjacent, non-overlapping proper intervals do not overlap', () => {
    const a = {start: t('10:00'), end: t('11:00')};
    const b = {start: t('12:00'), end: t('13:00')};
    expect(Utility.tripsOverlap(a, b)).toBe(false);
  });

  it('a point trip at another interval\'s start conflicts (start is inclusive)', () => {
    const interval = {start: t('09:00'), end: t('20:00')};
    const point = {start: t('09:00'), end: null};
    expect(Utility.tripsOverlap(interval, point)).toBe(true);
    expect(Utility.tripsOverlap(point, interval)).toBe(true);
  });

  it('a point trip at another interval\'s end does NOT conflict (end is exclusive)', () => {
    const interval = {start: t('10:00'), end: t('17:00')};
    const point = {start: t('17:00'), end: null};
    expect(Utility.tripsOverlap(interval, point)).toBe(false);
    expect(Utility.tripsOverlap(point, interval)).toBe(false);
  });

  it('a point trip strictly inside another interval conflicts', () => {
    const interval = {start: t('09:00'), end: t('20:00')};
    const point = {start: t('14:00'), end: null};
    expect(Utility.tripsOverlap(interval, point)).toBe(true);
  });

  it('a point trip outside another interval does not conflict', () => {
    const interval = {start: t('09:00'), end: t('20:00')};
    const point = {start: t('21:00'), end: null};
    expect(Utility.tripsOverlap(interval, point)).toBe(false);
  });

  it('two point trips only conflict on the exact same instant', () => {
    expect(Utility.tripsOverlap({start: t('09:00'), end: null}, {start: t('09:00'), end: null})).toBe(true);
    expect(Utility.tripsOverlap({start: t('09:00'), end: null}, {start: t('10:00'), end: null})).toBe(false);
  });
});

describe('Utility.timeRangeLabel', () => {
  it('formats a trip with an end as "HH:mm–HH:mm"', () => {
    expect(Utility.timeRangeLabel(trip({start: t('09:00'), end: t('12:30')}))).toBe('09:00–12:30');
  });

  it('formats a trip with no end as just "HH:mm"', () => {
    expect(Utility.timeRangeLabel(trip({start: t('09:00'), end: null}))).toBe('09:00');
  });
});

describe('Utility.findAssignmentConflicts', () => {
  it('finds conflicts only for drivers/vehicles that overlap another trip', () => {
    const conflicting = trip({start: t('10:00'), end: t('14:00'), drivers: ['d1'], vehicles: ['v1']});
    const clear = trip({start: t('15:00'), end: t('16:00'), drivers: ['d2'], vehicles: ['v2']});
    const subject = {
      key: 'subject', start: t('12:00'), end: t('13:00'),
      drivers: ['d1', 'd2'], vehicles: ['v1', 'v2'],
    };
    const result = Utility.findAssignmentConflicts(subject, [conflicting, clear]);
    expect(result.driverConflicts.get('d1')).toEqual([conflicting]);
    expect(result.driverConflicts.has('d2')).toBe(false);
    expect(result.vehicleConflicts.get('v1')).toEqual([conflicting]);
    expect(result.vehicleConflicts.has('v2')).toBe(false);
  });

  it('excludes the subject\'s own trip from its own candidates by key', () => {
    const self = trip({$key: 'self', start: t('10:00'), end: t('14:00'), drivers: ['d1']});
    const subject = {key: 'self', start: t('10:00'), end: t('14:00'), drivers: ['d1'], vehicles: []};
    const result = Utility.findAssignmentConflicts(subject, [self]);
    expect(result.driverConflicts.size).toBe(0);
  });

  it('an unsaved draft (no key) is checked against every candidate, since none can be "itself"', () => {
    const other = trip({$key: 'other', start: t('10:00'), end: t('14:00'), drivers: ['d1']});
    const draft = {start: t('12:00'), end: t('13:00'), drivers: ['d1'], vehicles: []};
    const result = Utility.findAssignmentConflicts(draft, [other]);
    expect(result.driverConflicts.get('d1')).toEqual([other]);
  });
});

describe('Utility.computeAssignmentWarnings', () => {
  it('keys results by trip.$key and finds mutual conflicts between two overlapping trips', () => {
    const a = trip({$key: 'a', start: t('10:00'), end: t('14:00'), drivers: ['d1']});
    const b = trip({$key: 'b', start: t('12:00'), end: t('16:00'), drivers: ['d1']});
    const result = Utility.computeAssignmentWarnings([a, b]);
    expect(result.get('a')!.driverConflicts.get('d1')).toEqual([b]);
    expect(result.get('b')!.driverConflicts.get('d1')).toEqual([a]);
  });

  it('a trip with no conflicts still gets an entry, with empty conflict maps', () => {
    const solo = trip({$key: 'solo', start: t('10:00'), end: t('11:00'), drivers: ['d1']});
    const result = Utility.computeAssignmentWarnings([solo]);
    expect(result.has('solo')).toBe(true);
    expect(result.get('solo')!.driverConflicts.size).toBe(0);
  });
});
