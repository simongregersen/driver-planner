import moment from 'moment';
import {DateUtility} from './date-utility';

// No constructor dependencies, so a plain instance is enough — no Angular TestBed needed.
const dateUtility = new DateUtility();

describe('DateUtility.toMoment', () => {
  it('returns null when date is null', () => {
    expect(dateUtility.toMoment(null)).toBeNull();
  });

  it('with no time, returns the date at start of day (its own time-of-day is dropped)', () => {
    const date = moment('2026-03-15 14:37', 'YYYY-MM-DD HH:mm');
    expect(dateUtility.toMoment(date)!.format('YYYY-MM-DD HH:mm')).toBe('2026-03-15 00:00');
  });

  it('combines date\'s year/month/day with time\'s hour/minute, ignoring date\'s own time and time\'s own day', () => {
    const date = moment('2026-03-15 23:59', 'YYYY-MM-DD HH:mm');
    const time = moment('1970-01-01 09:30', 'YYYY-MM-DD HH:mm');
    expect(dateUtility.toMoment(date, time)!.format('YYYY-MM-DD HH:mm')).toBe('2026-03-15 09:30');
  });

  it('a null time is treated the same as no time at all', () => {
    const date = moment('2026-03-15 14:37', 'YYYY-MM-DD HH:mm');
    expect(dateUtility.toMoment(date, null)!.format('YYYY-MM-DD HH:mm')).toBe('2026-03-15 00:00');
  });

  it('does not mutate the original date passed in', () => {
    const date = moment('2026-03-15 14:37', 'YYYY-MM-DD HH:mm');
    dateUtility.toMoment(date);
    expect(date.format('YYYY-MM-DD HH:mm')).toBe('2026-03-15 14:37');
  });
});

describe('DateUtility.getDate', () => {
  it('strips the time-of-day, keeping the calendar day', () => {
    const date = moment('2026-03-15 14:37', 'YYYY-MM-DD HH:mm');
    expect(dateUtility.getDate(date).format('YYYY-MM-DD HH:mm')).toBe('2026-03-15 00:00');
  });

  it('does not mutate the original', () => {
    const date = moment('2026-03-15 14:37', 'YYYY-MM-DD HH:mm');
    dateUtility.getDate(date);
    expect(date.format('HH:mm')).toBe('14:37');
  });
});

describe('DateUtility.getTime', () => {
  it('returns an equal but distinct clone', () => {
    const date = moment('2026-03-15 14:37', 'YYYY-MM-DD HH:mm');
    const clone = dateUtility.getTime(date);
    expect(clone.isSame(date)).toBe(true);
    expect(clone).not.toBe(date);
    clone.add(1, 'hour');
    expect(date.format('HH:mm')).toBe('14:37');
  });
});

describe('DateUtility.dateKey', () => {
  it('formats as YYYY-MM-DD regardless of time-of-day', () => {
    expect(dateUtility.dateKey(moment('2026-03-05 23:59', 'YYYY-MM-DD HH:mm'))).toBe('2026-03-05');
  });
});

describe('DateUtility.today', () => {
  it('is the current calendar day at start of day', () => {
    expect(dateUtility.today().isSame(moment().startOf('day'))).toBe(true);
  });
});

describe('DateUtility.minDate', () => {
  it('is today\'s date N years back, at start of day', () => {
    const expected = moment().subtract(5, 'years').startOf('day');
    expect(dateUtility.minDate(5).isSame(expected, 'day')).toBe(true);
  });
});

describe('DateUtility.equals / before / after', () => {
  const day1 = moment('2026-03-15 08:00', 'YYYY-MM-DD HH:mm');
  const day1Later = moment('2026-03-15 20:00', 'YYYY-MM-DD HH:mm');
  const day2 = moment('2026-03-16 08:00', 'YYYY-MM-DD HH:mm');

  it('equals is true for the same calendar day regardless of time, false across days', () => {
    expect(dateUtility.equals(day1, day1Later)).toBe(true);
    expect(dateUtility.equals(day1, day2)).toBe(false);
  });

  it('equals/before/after are all false when either side is null', () => {
    expect(dateUtility.equals(null, day1)).toBe(false);
    expect(dateUtility.before(null, day1)).toBe(false);
    expect(dateUtility.before(day1, null)).toBe(false);
    expect(dateUtility.after(null, day1)).toBe(false);
    expect(dateUtility.after(day1, null)).toBe(false);
  });

  it('before/after compare by calendar day, not exact instant', () => {
    expect(dateUtility.before(day1, day2)).toBe(true);
    expect(dateUtility.before(day1, day1Later)).toBe(false); // same day, not strictly before
    expect(dateUtility.after(day2, day1)).toBe(true);
    expect(dateUtility.after(day1Later, day1)).toBe(false); // same day, not strictly after
  });
});

describe('DateUtility.isPast', () => {
  it('is true for yesterday and false for today or the future', () => {
    expect(dateUtility.isPast(moment().subtract(1, 'day'))).toBe(true);
    expect(dateUtility.isPast(moment())).toBe(false);
    expect(dateUtility.isPast(moment().add(1, 'day'))).toBe(false);
  });
});

describe('DateUtility.addDays', () => {
  it('adds (or, with a negative count, subtracts) whole days without mutating the input', () => {
    const date = moment('2026-03-15', 'YYYY-MM-DD');
    expect(dateUtility.addDays(date, 3).format('YYYY-MM-DD')).toBe('2026-03-18');
    expect(dateUtility.addDays(date, -3).format('YYYY-MM-DD')).toBe('2026-03-12');
    expect(date.format('YYYY-MM-DD')).toBe('2026-03-15');
  });
});

describe('DateUtility.range', () => {
  it('with a null "to", returns just the single start date', () => {
    const from = moment('2026-03-15', 'YYYY-MM-DD');
    const result = dateUtility.range(from, null);
    expect(result.map(d => d.format('YYYY-MM-DD'))).toEqual(['2026-03-15']);
  });

  it('returns every day from start to end, inclusive of both ends', () => {
    const from = moment('2026-03-15', 'YYYY-MM-DD');
    const to = moment('2026-03-18', 'YYYY-MM-DD');
    const result = dateUtility.range(from, to);
    expect(result.map(d => d.format('YYYY-MM-DD'))).toEqual(['2026-03-15', '2026-03-16', '2026-03-17', '2026-03-18']);
  });

  it('when from and to are the same day, returns a single-element array', () => {
    const day = moment('2026-03-15', 'YYYY-MM-DD');
    const result = dateUtility.range(day, day);
    expect(result.map(d => d.format('YYYY-MM-DD'))).toEqual(['2026-03-15']);
  });
});
