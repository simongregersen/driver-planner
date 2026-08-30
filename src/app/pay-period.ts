import moment, {Moment} from 'moment';
import {ClockRecord} from './clock-record';

/**
 * Payroll periods and the arithmetic done inside them.
 *
 * This is the one place in the app that turns clock records into money. Two views compute from
 * it — a driver's own Timeseddel, day by day, and the admin's overview table, one figure per
 * driver per period — and they must agree to the minute. They only do so because both go through
 * the functions below rather than each summing records their own way.
 *
 * Deliberately free of Angular and of DateUtility: it is a plain module so it can be unit-tested
 * without a TestBed, and payroll policy (where a period starts, what a døgn is worth) is not a
 * date-formatting concern. The one overlap — a 'YYYY-MM-DD' key — is duplicated rather than
 * imported for exactly that reason.
 */

export const PAY_PERIOD_DAYS = 14;

export interface PayPeriod {
  /** Always the Monday of an even ISO week, at start of day. */
  start: Moment;
  /** The last day of the period, inclusive: start + 13 days. */
  end: Moment;
  /** The period's identity, 'YYYY-MM-DD' of its start. Also the key it is stored under — see
   * DataStore.getPaidPeriods. */
  key: string;
  /** 'Uge 32-33'. */
  label: string;
}

export interface PayPeriodTotals {
  /** Hourly work only. Døgnbetaling records are counted in dognCount instead — see below. */
  minutes: number;
  dognCount: number;
}

/** Monday of the date's own ISO week, pulled back an extra week if that week is odd-numbered,
 * so the result always lands on the Monday of an even ISO week. Payroll runs in fixed 14-day
 * periods, two ISO weeks at a time, anchored that way. */
export function payPeriodStartFor(date: Moment): Moment {
  const monday = date.clone().startOf('isoWeek');
  return monday.isoWeek() % 2 === 0 ? monday : monday.subtract(1, 'week');
}

/** The period beginning on `start`, which must already be anchored (see payPeriodStartFor).
 *
 * Day arithmetic, not hours: moment's add(n, 'days') keeps the wall-clock time across a daylight
 * saving change, so a period spanning the March or October transition is still 14 calendar days
 * rather than 13 days 23 hours. */
export function payPeriodFrom(start: Moment): PayPeriod {
  const from = start.clone().startOf('day');
  const end = from.clone().add(PAY_PERIOD_DAYS - 1, 'days');
  return {
    start: from,
    end,
    key: from.format('YYYY-MM-DD'),
    label: `Uge ${from.isoWeek()}-${end.isoWeek()}`,
  };
}

export function payPeriodFor(date: Moment): PayPeriod {
  return payPeriodFrom(payPeriodStartFor(date));
}

export function shiftPayPeriod(period: PayPeriod, byPeriods: number): PayPeriod {
  return payPeriodFrom(period.start.clone().add(byPeriods * PAY_PERIOD_DAYS, 'days'));
}

/** `count` consecutive periods ending with `last`, oldest first — the admin overview's columns,
 * left to right. */
export function recentPayPeriods(count: number, last: PayPeriod): PayPeriod[] {
  const periods: PayPeriod[] = [];
  for (let i = count - 1; i >= 0; i--) {
    periods.push(shiftPayPeriod(last, -i));
  }
  return periods;
}

export function recordHasError(record: ClockRecord): boolean {
  return !!(record.clockOut && record.clockOut.isBefore(record.clockIn));
}

/** A record's worked minutes: zero while a shift is still open, and zero for one whose clock-out
 * precedes its clock-in (a mistyped correction — flagged as an error rather than counted as
 * negative work). */
export function recordMinutes(record: ClockRecord): number {
  return record.clockOut && record.clockOut.isAfter(record.clockIn)
    ? record.clockOut.diff(record.clockIn, 'minutes')
    : 0;
}

/** Every 24-hour block a Døgnbetaling trip touches counts as a full paid day, so a trip one
 * minute into a new block (e.g. 48:01) bills as 3 days, not 2 — ceil, not floor/round. */
export function recordDognCount(record: ClockRecord): number {
  return record.dognbetaling ? Math.ceil(recordMinutes(record) / (24 * 60)) : 0;
}

/** Døgnbetaling records are paid per day, not per hour, so they are kept out of the hourly total
 * and summed separately. A record is one or the other, never both. */
export function clockRecordTotals(records: ClockRecord[]): PayPeriodTotals {
  return {
    minutes: records.filter(r => !r.dognbetaling).reduce((sum, r) => sum + recordMinutes(r), 0),
    dognCount: records.reduce((sum, r) => sum + recordDognCount(r), 0),
  };
}

export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export function formatDogn(count: number): string {
  return `${count} døgn`;
}

/** The period a clock record belongs to, as a period key. Bucketed by clock-in: a shift that runs
 * past midnight — or past the end of a period — belongs wholly to the period it started in, the
 * same rule the day-by-day view uses to file it under the day it began. */
export function payPeriodKeyOf(record: ClockRecord): string {
  return payPeriodStartFor(record.clockIn).format('YYYY-MM-DD');
}

/** Parses a period key back into its period. For a key read from storage. */
export function payPeriodFromKey(key: string): PayPeriod {
  return payPeriodFrom(moment(key, 'YYYY-MM-DD'));
}
