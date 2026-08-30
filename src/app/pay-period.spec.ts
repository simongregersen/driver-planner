import moment from 'moment';
import {ClockRecord} from './clock-record';
import {
  clockRecordTotals,
  formatDogn,
  formatDuration,
  PAY_PERIOD_DAYS,
  payPeriodFor,
  payPeriodFrom,
  payPeriodFromKey,
  payPeriodKeyOf,
  payPeriodStartFor,
  recentPayPeriods,
  recordDognCount,
  recordHasError,
  recordMinutes,
  shiftPayPeriod,
} from './pay-period';

/**
 * The payroll arithmetic, which two views compute from independently: a driver's own Timeseddel
 * builds it day by day, the admin's overview table sums a whole period into one cell. They agree
 * only because both go through this module — the last suite below is what pins that down.
 *
 * No TestBed: pay-period.ts deliberately has no Angular dependencies.
 */

const at = (value: string) => moment(value, 'YYYY-MM-DD HH:mm');

function record(clockIn: string, clockOut: string | null, dognbetaling = false): ClockRecord {
  return {
    $key: `${clockIn}-${clockOut}`,
    clockIn: at(clockIn),
    clockOut: clockOut ? at(clockOut) : null,
    dognbetaling,
  };
}

describe('payPeriodStartFor', () => {
  // 2026-08-03 is the Monday of ISO week 32 (even), so it anchors itself.
  it('returns the day itself for the Monday of an even ISO week', () => {
    const start = payPeriodStartFor(at('2026-08-03 00:00'));
    expect(start.format('YYYY-MM-DD')).toBe('2026-08-03');
    expect(start.isoWeek() % 2).toBe(0);
  });

  it('anchors any day of an even week back to that week\'s Monday', () => {
    expect(payPeriodStartFor(at('2026-08-06 14:37')).format('YYYY-MM-DD')).toBe('2026-08-03');
    // Sunday: moment's ISO week still starts on Monday, unlike its default locale week.
    expect(payPeriodStartFor(at('2026-08-09 23:59')).format('YYYY-MM-DD')).toBe('2026-08-03');
  });

  it('pulls a day in an odd week back into the preceding even week', () => {
    // 2026-08-10 is the Monday of week 33 (odd) — the second half of the same period.
    expect(payPeriodStartFor(at('2026-08-10 00:00')).format('YYYY-MM-DD')).toBe('2026-08-03');
    expect(payPeriodStartFor(at('2026-08-16 23:59')).format('YYYY-MM-DD')).toBe('2026-08-03');
  });

  it('is idempotent', () => {
    const once = payPeriodStartFor(at('2026-08-14 09:00'));
    expect(payPeriodStartFor(once).format('YYYY-MM-DD')).toBe(once.format('YYYY-MM-DD'));
  });

  it('does not mutate the date passed in', () => {
    const date = at('2026-08-14 09:00');
    payPeriodStartFor(date);
    expect(date.format('YYYY-MM-DD HH:mm')).toBe('2026-08-14 09:00');
  });

  // The anchor is defined on the ISO week number, which restarts at 1 each ISO year — so the
  // parity of a given calendar date's week is not the same from one year to the next, and a
  // period can span a year boundary. What must hold is only that the result is always an even
  // week's Monday.
  it('lands on an even ISO week across an ISO-year boundary', () => {
    for (const date of ['2025-12-29 08:00', '2026-01-01 08:00', '2026-01-05 08:00', '2026-01-12 08:00']) {
      const start = payPeriodStartFor(at(date));
      expect(start.isoWeekday()).toBe(1);
      expect(start.isoWeek() % 2).toBe(0);
      expect(start.isSameOrBefore(at(date), 'day')).toBe(true);
    }
  });
});

describe('payPeriodFrom', () => {
  it('covers 14 days, end inclusive', () => {
    const period = payPeriodFrom(at('2026-08-03 00:00'));
    expect(period.start.format('YYYY-MM-DD')).toBe('2026-08-03');
    expect(period.end.format('YYYY-MM-DD')).toBe('2026-08-16');
    expect(period.end.diff(period.start, 'days') + 1).toBe(PAY_PERIOD_DAYS);
  });

  it('keys on its start date and labels itself with both ISO weeks', () => {
    const period = payPeriodFrom(at('2026-08-03 00:00'));
    expect(period.key).toBe('2026-08-03');
    expect(period.label).toBe('Uge 32-33');
  });

  it('strips a time-of-day off the start it is given', () => {
    expect(payPeriodFrom(at('2026-08-03 14:37')).start.format('HH:mm')).toBe('00:00');
  });

  // add(n, 'days') is calendar arithmetic, so it keeps the wall-clock time across a DST change.
  // add(n * 24, 'hours') would not, and a period spanning the transition would come up an hour
  // short or long — enough to move its final day.
  it('still covers 14 calendar days across the spring DST transition', () => {
    // Europe/Copenhagen springs forward on 2026-03-29, inside this period.
    const period = payPeriodFrom(payPeriodStartFor(at('2026-03-30 12:00')));
    expect(period.end.diff(period.start, 'days') + 1).toBe(PAY_PERIOD_DAYS);
    expect(period.start.format('HH:mm')).toBe('00:00');
    expect(period.end.format('HH:mm')).toBe('00:00');
  });

  it('still covers 14 calendar days across the autumn DST transition', () => {
    // Europe/Copenhagen falls back on 2026-10-25.
    const period = payPeriodFrom(payPeriodStartFor(at('2026-10-26 12:00')));
    expect(period.end.diff(period.start, 'days') + 1).toBe(PAY_PERIOD_DAYS);
    expect(period.start.format('HH:mm')).toBe('00:00');
    expect(period.end.format('HH:mm')).toBe('00:00');
  });
});

describe('shiftPayPeriod', () => {
  it('steps a whole period at a time, in both directions', () => {
    const period = payPeriodFor(at('2026-08-06 10:00'));
    expect(shiftPayPeriod(period, -1).key).toBe('2026-07-20');
    expect(shiftPayPeriod(period, 1).key).toBe('2026-08-17');
    expect(shiftPayPeriod(period, 0).key).toBe(period.key);
  });

  it('keeps landing on an even ISO week, including across a DST transition', () => {
    let period = payPeriodFor(at('2026-03-02 10:00'));
    for (let i = 0; i < 6; i++) {
      period = shiftPayPeriod(period, 1);
      expect(period.start.isoWeekday()).toBe(1);
      expect(period.start.isoWeek() % 2).toBe(0);
    }
  });

  it('consecutive periods are exactly 14 days apart across the spring DST transition', () => {
    const before = payPeriodFor(at('2026-03-16 10:00'));
    const after = shiftPayPeriod(before, 1);
    expect(after.start.diff(before.start, 'days')).toBe(PAY_PERIOD_DAYS);
    expect(before.end.clone().add(1, 'day').format('YYYY-MM-DD')).toBe(after.start.format('YYYY-MM-DD'));
  });
});

describe('recentPayPeriods', () => {
  it('returns the requested count, oldest first, ending with the one given', () => {
    const last = payPeriodFor(at('2026-08-06 10:00'));
    const periods = recentPayPeriods(6, last);
    expect(periods.map(p => p.key)).toEqual([
      '2026-05-25', '2026-06-08', '2026-06-22', '2026-07-06', '2026-07-20', '2026-08-03',
    ]);
    expect(periods.at(-1)!.key).toBe(last.key);
  });

  it('leaves no gaps between adjacent columns', () => {
    const periods = recentPayPeriods(6, payPeriodFor(at('2026-08-06 10:00')));
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].start.diff(periods[i - 1].start, 'days')).toBe(PAY_PERIOD_DAYS);
    }
  });
});

describe('payPeriodKeyOf', () => {
  // The same rule the day-by-day view files records under: the day (and so the period) a shift
  // began, never the one it ended in.
  it('files a shift by its clock-in, even when it ends in the next period', () => {
    // 2026-08-16 is the last day of the period starting 2026-08-03.
    expect(payPeriodKeyOf(record('2026-08-16 23:00', '2026-08-17 07:00'))).toBe('2026-08-03');
  });

  it('files a shift starting in a new period under that new period', () => {
    expect(payPeriodKeyOf(record('2026-08-17 00:30', '2026-08-17 08:00'))).toBe('2026-08-17');
  });

  it('round-trips through payPeriodFromKey', () => {
    const period = payPeriodFor(at('2026-08-06 10:00'));
    expect(payPeriodFromKey(period.key).key).toBe(period.key);
    expect(payPeriodFromKey(period.key).label).toBe(period.label);
  });
});

describe('recordMinutes and recordHasError', () => {
  it('counts the span between clock-in and clock-out', () => {
    expect(recordMinutes(record('2026-08-03 08:00', '2026-08-03 16:30'))).toBe(510);
  });

  it('counts an open shift as nothing yet', () => {
    expect(recordMinutes(record('2026-08-03 08:00', null))).toBe(0);
    expect(recordHasError(record('2026-08-03 08:00', null))).toBe(false);
  });

  it('counts a shift ending before it began as nothing, and flags it', () => {
    const inverted = record('2026-08-03 16:00', '2026-08-03 08:00');
    expect(recordMinutes(inverted)).toBe(0);
    expect(recordHasError(inverted)).toBe(true);
  });

  it('counts a shift running past midnight in full', () => {
    expect(recordMinutes(record('2026-08-03 22:00', '2026-08-04 06:00'))).toBe(480);
  });
});

describe('recordDognCount', () => {
  it('is zero for an ordinary hourly record, however long', () => {
    expect(recordDognCount(record('2026-08-03 08:00', '2026-08-05 08:00'))).toBe(0);
  });

  it('counts every 24-hour block a døgn record touches, rounding up', () => {
    expect(recordDognCount(record('2026-08-03 08:00', '2026-08-04 08:00', true))).toBe(1);
    // 48:01 — one minute into a third block, so three paid days.
    expect(recordDognCount(record('2026-08-03 08:00', '2026-08-05 08:01', true))).toBe(3);
    expect(recordDognCount(record('2026-08-03 08:00', '2026-08-03 09:00', true))).toBe(1);
  });

  it('is zero for an open døgn record', () => {
    expect(recordDognCount(record('2026-08-03 08:00', null, true))).toBe(0);
  });
});

describe('clockRecordTotals', () => {
  it('sums hourly records', () => {
    const totals = clockRecordTotals([
      record('2026-08-03 08:00', '2026-08-03 16:00'),
      record('2026-08-04 08:00', '2026-08-04 12:30'),
    ]);
    expect(totals).toEqual({minutes: 750, dognCount: 0});
  });

  // The rule that makes a døgn record a day rather than a number of hours: counting it in both
  // would pay for the same work twice.
  it('keeps døgn records out of the hourly total and counts them as days instead', () => {
    const totals = clockRecordTotals([
      record('2026-08-03 08:00', '2026-08-03 16:00'),
      record('2026-08-04 06:00', '2026-08-06 06:00', true),
    ]);
    expect(totals).toEqual({minutes: 480, dognCount: 2});
  });

  it('is empty for no records', () => {
    expect(clockRecordTotals([])).toEqual({minutes: 0, dognCount: 0});
  });
});

describe('formatting', () => {
  it('formats minutes as H:MM, zero-padding the minutes and never the hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(600)).toBe('10:00');
    // A period total runs well past 24 hours, so hours are not wrapped.
    expect(formatDuration(8000)).toBe('133:20');
  });

  it('formats a day count', () => {
    expect(formatDogn(1)).toBe('1 døgn');
    expect(formatDogn(3)).toBe('3 døgn');
  });
});

/**
 * The invariant the whole module exists for: a period's cell in the admin's overview and the
 * driver's own day-by-day view are computed by different code paths, and must never disagree.
 */
describe('a period summed whole against the same period summed day by day', () => {
  const RECORDS = [
    record('2026-08-03 08:00', '2026-08-03 16:30'),        // 510 hourly
    record('2026-08-04 22:00', '2026-08-05 06:15'),        // 495 hourly, past midnight
    record('2026-08-06 09:00', null),                      // open, counts as nothing
    record('2026-08-07 12:00', '2026-08-07 09:00'),        // inverted, counts as nothing
    record('2026-08-10 06:00', '2026-08-12 06:01', true),  // 3 døgn
    record('2026-08-16 23:00', '2026-08-17 07:00'),        // 480 hourly, ends in the next period
  ];

  it('agrees to the minute', () => {
    const whole = clockRecordTotals(RECORDS);

    // How the day-by-day view reaches the same number: bucket by clock-in date, total each day,
    // then add the days up.
    const byDay = new Map<string, ClockRecord[]>();
    for (const r of RECORDS) {
      const day = r.clockIn.format('YYYY-MM-DD');
      byDay.set(day, [...(byDay.get(day) ?? []), r]);
    }
    const dayTotals = [...byDay.values()].map(clockRecordTotals);
    const summed = {
      minutes: dayTotals.reduce((sum, t) => sum + t.minutes, 0),
      dognCount: dayTotals.reduce((sum, t) => sum + t.dognCount, 0),
    };

    expect(summed).toEqual(whole);
    expect(formatDuration(whole.minutes)).toBe('24:45');
    expect(whole.dognCount).toBe(3);
  });

  it('files every one of those records in the period the overview would put it in', () => {
    const keys = RECORDS.map(payPeriodKeyOf);
    expect(keys).toEqual(['2026-08-03', '2026-08-03', '2026-08-03', '2026-08-03', '2026-08-03', '2026-08-03']);
  });
});
