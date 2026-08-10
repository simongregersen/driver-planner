import {Driver} from './driver';
import {Trip} from './trip';
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

}
