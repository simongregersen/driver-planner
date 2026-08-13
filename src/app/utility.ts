import {Driver} from './driver';
import {Trip} from './trip';
import {Note} from './note';
import {Moment} from 'moment';

export class Utility {
  static filterDeleted(arr: any[]): any[] {
    return arr.filter(d => !d.deleted);
  }

  static isAssigned(driver: Driver, trip: Trip): boolean {
    const drivers = trip.drivers || [];
    return drivers.includes(driver.$key);
  }

  static sortByDisplayName(arr: any[]): any[] {
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

}
