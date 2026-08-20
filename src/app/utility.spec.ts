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

describe('Utility.mergeTripWindows', () => {
  // Mirrors DataStore.getTrips: `inWindow` is the start-ordered query for the visible window,
  // `multiDay` the sparse multiDayStart-indexed one reaching further back.
  const t = (key: string) => ({$key: key});

  it('puts trips that started before the window ahead of the window\'s own', () => {
    expect(Utility.mergeTripWindows([t('b')], [t('a')]).map(x => x.$key)).toEqual(['a', 'b']);
  });

  it('does not duplicate a multi-day trip that also starts inside the window', () => {
    // A trip starting inside the window matches both queries; without the dedupe it would render
    // twice on the plan.
    expect(Utility.mergeTripWindows([t('a'), t('b')], [t('a')]).map(x => x.$key)).toEqual(['a', 'b']);
  });

  it('preserves the order within each query rather than re-sorting', () => {
    expect(Utility.mergeTripWindows([t('c'), t('d')], [t('a'), t('b')]).map(x => x.$key))
      .toEqual(['a', 'b', 'c', 'd']);
  });

  it('handles either side being empty', () => {
    expect(Utility.mergeTripWindows([t('a')], []).map(x => x.$key)).toEqual(['a']);
    expect(Utility.mergeTripWindows([], [t('a')]).map(x => x.$key)).toEqual(['a']);
    expect(Utility.mergeTripWindows<{$key: string}>([], [])).toEqual([]);
  });
});

describe('Utility.multiDayStartValue', () => {
  it('is null for a trip that starts and ends on the same day', () => {
    expect(Utility.multiDayStartValue(moment('2026-03-10T08:00'), moment('2026-03-10T23:30'))).toBeNull();
  });

  it('is null for a trip with no end at all', () => {
    expect(Utility.multiDayStartValue(moment('2026-03-10T08:00'), null)).toBeNull();
    expect(Utility.multiDayStartValue(moment('2026-03-10T08:00'), undefined)).toBeNull();
  });

  it("is the trip's own start once it crosses midnight", () => {
    const start = moment('2026-03-10T23:00');
    expect(Utility.multiDayStartValue(start, moment('2026-03-11T01:00'))).toBe(start.valueOf());
  });

  it('is null rather than undefined, so an update clears a stale flag', () => {
    // Firebase treats null as "remove this key" but ignores undefined, so a trip shortened back
    // to a single day would otherwise keep its old multiDayStart and go on appearing on days it
    // no longer covers.
    const cleared = Utility.multiDayStartValue(moment('2026-03-10T08:00'), moment('2026-03-10T12:00'));
    expect(cleared).toBeNull();
    expect(cleared).not.toBeUndefined();
  });
});

describe('Utility staffing warnings', () => {
  // The empty cases are the reason these exist: 0 drivers and 0 vehicles balances arithmetically,
  // so a pure count comparison reads a wholly unassigned trip as fine. In a day plan it is the
  // opposite of fine.
  it('warns on both columns when nothing at all is assigned', () => {
    const unassigned = trip({drivers: [], vehicles: []});

    expect(Utility.hasDriverStaffingWarning(unassigned)).toBe(true);
    expect(Utility.hasVehicleStaffingWarning(unassigned)).toBe(true);
  });

  it('warns about the missing side when only one is assigned', () => {
    const noVehicle = trip({drivers: ['d1'], vehicles: []});
    expect(Utility.hasDriverStaffingWarning(noVehicle)).toBe(false);
    expect(Utility.hasVehicleStaffingWarning(noVehicle)).toBe(true);

    const noDriver = trip({drivers: [], vehicles: ['v1']});
    expect(Utility.hasDriverStaffingWarning(noDriver)).toBe(true);
    expect(Utility.hasVehicleStaffingWarning(noDriver)).toBe(false);
  });

  it('warns about whichever side is short when the counts are uneven', () => {
    const shortOfDrivers = trip({drivers: ['d1'], vehicles: ['v1', 'v2']});
    expect(Utility.hasDriverStaffingWarning(shortOfDrivers)).toBe(true);
    expect(Utility.hasVehicleStaffingWarning(shortOfDrivers)).toBe(false);

    const shortOfVehicles = trip({drivers: ['d1', 'd2'], vehicles: ['v1']});
    expect(Utility.hasDriverStaffingWarning(shortOfVehicles)).toBe(false);
    expect(Utility.hasVehicleStaffingWarning(shortOfVehicles)).toBe(true);
  });

  it('stays quiet when the counts match and neither is empty', () => {
    const balanced = trip({drivers: ['d1', 'd2'], vehicles: ['v1', 'v2']});

    expect(Utility.hasDriverStaffingWarning(balanced)).toBe(false);
    expect(Utility.hasVehicleStaffingWarning(balanced)).toBe(false);
  });
});

describe('Utility read receipts', () => {
  const V = 1700000000000;

  function read(version: number, dismissed = false) {
    return {at: moment(version + 60_000), version, dismissed};
  }

  // A trip carrying `modified` — i.e. one changed after its day was already public, which is the
  // only kind that can have been missed.
  function tracked(overrides: Partial<Trip> = {}): Trip {
    return trip({modified: moment(V), drivers: ['d1'], ...overrides});
  }

  describe('tripVersion', () => {
    it('is the modified timestamp for a trip changed after publication', () => {
      expect(Utility.tripVersion(tracked())).toBe(V);
    });

    // The gate the whole feature hangs off: a trip planned before its day went public was never
    // "changed", so there is nothing for anyone to have missed and nothing to track.
    it('is null for a trip that was never changed after publication', () => {
      expect(Utility.tripVersion(trip())).toBeNull();
    });
  });

  describe('hasReadTrip', () => {
    it('counts a receipt for the current version', () => {
      expect(Utility.hasReadTrip(tracked({reads: {d1: read(V)}}), 'd1')).toBe(true);
    });

    it('does not count a receipt for an older version', () => {
      expect(Utility.hasReadTrip(tracked({reads: {d1: read(V - 1000)}}), 'd1')).toBe(false);
    });

    it('does not count a missing receipt', () => {
      expect(Utility.hasReadTrip(tracked({reads: {d2: read(V)}}), 'd1')).toBe(false);
    });

    // The office writing a receipt to close a case it handled by phone silences the warning just
    // as a real read does — only the driver-facing label tells the two apart.
    it('counts an office-written receipt exactly like the driver s own', () => {
      expect(Utility.hasReadTrip(tracked({reads: {d1: read(V, true)}}), 'd1')).toBe(true);
    });
  });

  describe('unreadDrivers', () => {
    it('is empty once every assigned driver has a current receipt', () => {
      const t = tracked({drivers: ['d1', 'd2'], reads: {d1: read(V), d2: read(V)}});

      expect(Utility.unreadDrivers(t, [driver('d1'), driver('d2')])).toEqual([]);
    });

    it('names only the drivers still outstanding', () => {
      const t = tracked({drivers: ['d1', 'd2'], reads: {d1: read(V)}});

      expect(Utility.unreadDrivers(t, [driver('d1'), driver('d2')]).map(d => d.$key)).toEqual(['d2']);
    });

    it('treats a receipt for an older version as unread', () => {
      const t = tracked({reads: {d1: read(V - 1000)}});

      expect(Utility.unreadDrivers(t, [driver('d1')]).map(d => d.$key)).toEqual(['d1']);
    });

    // These two pin a deliberate decision rather than an oversight. Neither driver can ever
    // produce a receipt — one has no login, the other is logged out on sight — so excluding them
    // is the obvious way to stop the warning being permanent. They are counted anyway: an
    // unreachable driver is exactly when the office needs reminding to phone them, and the
    // dismissal button is what stops a permanent warning being a problem.
    it('still counts a driver who has no login to read it in', () => {
      const noLogin = {...driver('d1'), uid: undefined};

      expect(Utility.unreadDrivers(tracked(), [noLogin]).map(d => d.$key)).toEqual(['d1']);
    });

    it('still counts a soft-deleted driver who is left assigned', () => {
      const gone = {...driver('d1'), deleted: true};

      expect(Utility.unreadDrivers(tracked(), [gone]).map(d => d.$key)).toEqual(['d1']);
    });

    it('is empty for a trip that is not tracked at all', () => {
      expect(Utility.unreadDrivers(trip({drivers: ['d1']}), [driver('d1')])).toEqual([]);
    });
  });

  describe('hasUnreadWarning', () => {
    it('warns while somebody has not read the change', () => {
      expect(Utility.hasUnreadWarning(tracked(), [driver('d1')])).toBe(true);
    });

    it('stays quiet once everyone has read it', () => {
      const t = tracked({reads: {d1: read(V)}});

      expect(Utility.hasUnreadWarning(t, [driver('d1')])).toBe(false);
    });

    // Deliberately independent of when the trip runs, matching the driver's own "Ændret …"
    // highlight, which keys off when the change was made rather than off the trip's date. An
    // earlier version suppressed this once the trip was past, which hid the very cases most worth
    // seeing: a change nobody read before the trip went ahead.
    it('still warns after the trip s own date has passed', () => {
      const yesterday = trip({
        start: moment('2020-01-01 10:00', 'YYYY-MM-DD HH:mm'),
        end: moment('2020-01-01 12:00', 'YYYY-MM-DD HH:mm'),
        drivers: ['d1'],
        modified: moment(V),
      });

      expect(Utility.hasUnreadWarning(yesterday, [driver('d1')])).toBe(true);
    });

    it('stays quiet for a trip that was never changed after publication', () => {
      expect(Utility.hasUnreadWarning(trip({drivers: ['d1']}), [driver('d1')])).toBe(false);
    });

    // Dismissal is not a permanent mute: the receipts it writes carry the version they closed, so
    // the next real edit re-stamps `modified` and strands them exactly like genuine ones.
    it('warns again once a later edit stales the dismissal receipts', () => {
      const dismissed = tracked({reads: {d1: read(V, true)}});
      expect(Utility.hasUnreadWarning(dismissed, [driver('d1')])).toBe(false);

      const editedAgain = {...dismissed, modified: moment(V + 5000)};
      expect(Utility.hasUnreadWarning(editedAgain, [driver('d1')])).toBe(true);
    });
  });
});
