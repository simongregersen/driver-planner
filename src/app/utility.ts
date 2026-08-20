import {Driver} from './driver';
import {Trip} from './trip';
import {Note} from './note';
import {Moment} from 'moment';

export interface TripInterval {
  start: Moment;
  end: Moment | null;
}

export interface AssignmentConflicts {
  driverConflicts: Map<string, Trip[]>;
  vehicleConflicts: Map<string, Trip[]>;
}

export class Utility {
  static filterDeleted<T extends {deleted?: boolean}>(arr: T[]): T[] {
    return arr.filter(d => !d.deleted);
  }

  static isAssigned(driver: Driver, trip: Trip): boolean {
    const drivers = trip.drivers || [];
    return drivers.includes(driver.$key);
  }

  static sortByDisplayName<T extends {displayName: string}>(arr: T[]): T[] {
    return arr.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, {numeric: true}));
  }

  static copyDate(from: Moment, to: Moment): void {
    to.set({year: from.get('year'), month: from.get('month'), date: from.get('date')});
  }

  static sameDate(a: Moment | null, b: Moment | null): boolean {
    if (!a || !b) return false;
    return a.year() === b.year() && a.month() === b.month() && a.date() === b.date();
  }

  // Whether a trip overlaps the half-open window [start, end) at all — used both to filter an
  // overfetched query result down to genuine overlaps (DataStore.getTrips) and to decide which
  // specific day(s) within a wider range a multi-day trip should be shown under. A trip with no
  // `end` is treated as lasting only its own start instant.
  static tripOverlaps(trip: Trip, start: Moment, end: Moment): boolean {
    const effectiveEnd = trip.end ?? trip.start;
    return trip.start.isBefore(end) && effectiveEnd.isSameOrAfter(start);
  }

  // Combines the two windowed queries DataStore.getTrips issues — the ordinary start-ordered one
  // and the sparse multiDayStart-indexed one — into a single correctly-ordered list.
  //
  // Extracted from the rxjs pipeline so it can actually be tested: this is the subtlest piece of
  // logic in the data layer, it has no dependency on Firebase at all, and getting it wrong shows
  // up as trips silently missing from or duplicated on a plan rather than as an error.
  //
  // Anything left in `multiDay` once inWindow's own trips are excluded must have started before
  // the window (a trip starting inside it would have matched inWindow too), so it belongs ahead
  // of everything in inWindow. Both inputs are already start-ordered by their queries, so
  // concatenating in that order needs no further sort.
  static mergeTripWindows<T extends {$key: string}>(inWindow: T[], multiDay: T[]): T[] {
    const inWindowKeys = new Set(inWindow.map(t => t.$key));
    const beforeWindow = multiDay.filter(t => !inWindowKeys.has(t.$key));
    return [...beforeWindow, ...inWindow];
  }

  // The value DataStore writes to a trip's sparse multiDayStart index: the trip's own start when
  // it genuinely spans more than one calendar day, and null otherwise.
  //
  // Null rather than undefined matters on the update path — Firebase treats null as "remove this
  // key", which is what clears a stale flag when an edit shortens a trip back to a single day.
  // Omitting the key instead would leave the old value in place and keep the trip appearing on
  // days it no longer covers.
  static multiDayStartValue(start: Moment, end: Moment | null | undefined): number | null {
    return (end && !Utility.sameDate(start, end)) ? start.valueOf() : null;
  }

  // A note's start/end are both dates (no time), so a given date "applies" whenever it falls
  // anywhere within that inclusive range — used by both Day Plans (all notes for the day) and
  // My Day (just the ones assigned to the signed-in driver).
  static noteAppliesToDate(note: Note, date: Moment): boolean {
    return !date.isBefore(note.start, 'day') && !date.isAfter(note.end, 'day');
  }

  // Symmetric overlap between two trips' own occupied intervals — unlike tripOverlaps above (a
  // window-vs-trip check), this compares two trips directly. A trip with an `end` is a half-open
  // interval [start, end): two such trips that are merely back-to-back (one's end exactly equal
  // to the other's start) do NOT count as overlapping, matching how every normal same-day
  // schedule hands a driver/vehicle straight from one trip to the next. A trip with no `end` is
  // instead a single closed instant, [start, start] — checked against that same half-open
  // convention, so a point trip lands inside another trip's range only from its start up to (but
  // not including) its end: a point at 9:00 DOES conflict with a 9:00–20:00 trip (its start is
  // inclusive), but a point at 17:00 does NOT conflict with a 10:00–17:00 trip (its end is
  // exclusive, same as the back-to-back case above). Two point trips only conflict when they land
  // on the exact same instant.
  static tripsOverlap(a: TripInterval, b: TripInterval): boolean {
    if (a.end == null && b.end == null) return a.start.isSame(b.start);
    if (a.end == null) {
      const bEnd = b.end ?? b.start;
      return !a.start.isBefore(b.start) && a.start.isBefore(bEnd);
    }
    if (b.end == null) {
      const aEnd = a.end ?? a.start;
      return !b.start.isBefore(a.start) && b.start.isBefore(aEnd);
    }
    return a.start.isBefore(b.end) && b.start.isBefore(a.end);
  }

  // Which of `subject`'s assigned drivers/vehicles also appear on some other, time-overlapping
  // trip in `candidates`. `subject` is either a real Trip (key set, so it excludes itself from
  // its own candidates) or an unsaved TripFormComponent draft (key omitted, since a new trip has
  // none yet).
  static findAssignmentConflicts(
    subject: {key?: string; start: Moment; end: Moment | null; drivers: string[]; vehicles: string[]},
    candidates: Trip[]
  ): AssignmentConflicts {
    const others = candidates.filter(t => t.$key !== subject.key);
    const overlapping = others.filter(t => Utility.tripsOverlap(subject, t));
    const driverConflicts = new Map<string, Trip[]>();
    for (const key of subject.drivers) {
      const conflicts = overlapping.filter(t => (t.drivers ?? []).includes(key));
      if (conflicts.length) driverConflicts.set(key, conflicts);
    }
    const vehicleConflicts = new Map<string, Trip[]>();
    for (const key of subject.vehicles) {
      const conflicts = overlapping.filter(t => (t.vehicles ?? []).includes(key));
      if (conflicts.length) vehicleConflicts.set(key, conflicts);
    }
    return {driverConflicts, vehicleConflicts};
  }

  // The two staffing warnings a planning view shows on a trip's driver and vehicle columns.
  //
  // Each fires on two distinct situations, and it matters that both are covered: an *imbalance*
  // (more vehicles than drivers, or the reverse — somebody or something is unaccounted for), and
  // an *empty* column. Empty needs saying separately because 0 drivers and 0 vehicles is
  // perfectly balanced arithmetically while being the least-ready state a trip can be in — the
  // one a day plan most needs to draw the planner's eye to. Reading it as "nothing to warn
  // about" is what let a wholly unassigned trip sit in a plan looking as settled as a fully
  // staffed one.
  static hasDriverStaffingWarning(trip: Trip): boolean {
    return trip.drivers.length === 0 || trip.drivers.length < trip.vehicles.length;
  }

  static hasVehicleStaffingWarning(trip: Trip): boolean {
    return trip.vehicles.length === 0 || trip.drivers.length > trip.vehicles.length;
  }

  // "HH:mm" for a trip with no end, "HH:mm–HH:mm" otherwise — shared by TripsComponent's chip
  // tooltip and TripFormComponent's inline warning so a conflicting trip is described identically
  // in both places.
  static timeRangeLabel(trip: Trip): string {
    const start = trip.start.format('HH:mm');
    return trip.end ? `${start}–${trip.end.format('HH:mm')}` : start;
  }

  // Every trip in `trips` checked against every other trip in the same list — the candidate set
  // a caller (Day Plans, Period Plans, My Trips) already has loaded for its own view, computed
  // once and keyed by trip.$key so TripsComponent can look up any given row's conflicts without
  // recomputing them itself.
  static computeAssignmentWarnings(trips: Trip[]): Map<string, AssignmentConflicts> {
    const result = new Map<string, AssignmentConflicts>();
    for (const trip of trips) {
      result.set(trip.$key, Utility.findAssignmentConflicts(
        {key: trip.$key, start: trip.start, end: trip.end, drivers: trip.drivers ?? [], vehicles: trip.vehicles ?? []},
        trips
      ));
    }
    return result;
  }

}
