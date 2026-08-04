import {NgbCalendar, NgbDate, NgbDateStruct, NgbTimeStruct} from '@ng-bootstrap/ng-bootstrap';
import {Injectable} from '@angular/core';
import moment from 'moment';
import {Moment} from 'moment';

@Injectable()
export class NgbUtility {

  constructor(private calendar: NgbCalendar) {
  }

  toMoment(date: NgbDateStruct | null, time?: NgbTimeStruct | null): Moment | null {
    if (!date) return null;
    const dateString = `${date.year}-${this.padNumber(date.month)}-${this.padNumber(date.day)}`;
    if (!time) return moment(dateString, 'YYYY-MM-DD');
    const timeString = `${this.padNumber(time.hour)}:${this.padNumber(time.minute)}`;
    return moment(dateString + ' ' + timeString, 'YYYY-MM-DD HH:mm');
  }

  getDate(date: Moment): NgbDateStruct {
    return {year: date.year(), month: date.month() + 1, day: date.date()};
  }

  getTime(date: Moment): NgbTimeStruct {
    return {hour: date.hour(), minute: date.minute(), second: date.second()};
  }

  equals(one: NgbDateStruct | null, two: NgbDateStruct | null): boolean {
    return !!(one && two && two.year === one.year && two.month === one.month && two.day === one.day);
  }

  before(one: NgbDateStruct | null, two: NgbDateStruct | null): boolean {
    return !one || !two ? false : one.year === two.year ? one.month === two.month ? one.day === two.day
      ? false : one.day < two.day : one.month < two.month : one.year < two.year;
  }

  after(one: NgbDateStruct | null, two: NgbDateStruct | null): boolean {
    return !one || !two ? false : one.year === two.year ? one.month === two.month ? one.day === two.day
      ? false : one.day > two.day : one.month > two.month : one.year > two.year;
  }

  range(from: NgbDateStruct, to: NgbDateStruct | null): NgbDate[] {
    let fromDate = NgbDate.from(from)!;
    const toDate = NgbDate.from(to);
    const res: NgbDate[] = [fromDate];

    while (toDate && this.before(fromDate, toDate)) {
      fromDate = this.calendar.getNext(fromDate, 'd');
      res.push(fromDate);
    }
    return res;
  }

  private padNumber(value: number) {
    if (typeof value === 'number') {
      return `0${value}`.slice(-2);
    } else {
      return '';
    }
  }

}
