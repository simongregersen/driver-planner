import {Injectable} from '@angular/core';
import moment from 'moment';
import {Moment} from 'moment';

/**
 * Date/time helpers shared across the app. Dates and times are plain Moments — the same type
 * Angular Material's date adapter is configured with, so datepicker and timepicker form
 * controls hold Moments directly.
 *
 * A "date" only contributes its year/month/day and a "time" only its hour/minute, which is why
 * `toMoment` recombines them rather than using either value as-is.
 */
@Injectable({providedIn: 'root'})
export class DateUtility {

  toMoment(date: Moment | null, time?: Moment | null): Moment | null {
    if (!date) return null;
    const result = date.clone().startOf('day');
    if (!time) return result;
    return result.set({hour: time.hour(), minute: time.minute()});
  }

  getDate(date: Moment): Moment {
    return date.clone().startOf('day');
  }

  minDate(yearsBack: number): Moment {
    return this.getDate(moment().subtract(yearsBack, 'years'));
  }

  dateKey(date: Moment): string {
    return date.format('YYYY-MM-DD');
  }

  getTime(date: Moment): Moment {
    return date.clone();
  }

  today(): Moment {
    return moment().startOf('day');
  }

  equals(one: Moment | null, two: Moment | null): boolean {
    return !!(one && two && one.isSame(two, 'day'));
  }

  before(one: Moment | null, two: Moment | null): boolean {
    return !one || !two ? false : one.isBefore(two, 'day');
  }

  after(one: Moment | null, two: Moment | null): boolean {
    return !one || !two ? false : one.isAfter(two, 'day');
  }

  isPast(date: Moment): boolean {
    return this.before(date, this.today());
  }

  addDays(date: Moment, days: number): Moment {
    return date.clone().add(days, 'd');
  }

  range(from: Moment, to: Moment | null): Moment[] {
    let fromDate = this.getDate(from);
    const res: Moment[] = [fromDate];

    while (to && this.before(fromDate, to)) {
      fromDate = this.addDays(fromDate, 1);
      res.push(fromDate);
    }
    return res;
  }

}
