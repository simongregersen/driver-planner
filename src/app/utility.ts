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
