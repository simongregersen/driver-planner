import {TestBed} from '@angular/core/testing';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {of} from 'rxjs';
import moment from 'moment';
import {PayPeriodReportComponent} from './pay-period-report.component';
import {ClockRecordFormComponent} from '../clock-record-form/clock-record-form.component';
import {DataStore} from '../data.service';
import {ClockRecord} from '../clock-record';
import {Trip} from '../trip';

/**
 * The driver's own timesheet for one period — extracted out of TimeReportComponent so the admin
 * overview's period dialog can show the same thing. What's pinned here is what that extraction
 * had to preserve: the fortnight splits into its two ISO weeks, døgnbetaling is counted as days
 * rather than folded into the hours, and only trips on published days are listed.
 */
describe('PayPeriodReportComponent', () => {
  // 2026-08-03 is the Monday of ISO week 32 (even), so it anchors a period covering weeks 32-33.
  const PERIOD_START = moment('2026-08-03', 'YYYY-MM-DD');
  const at = (value: string) => moment(value, 'YYYY-MM-DD HH:mm');

  function record(key: string, clockIn: string, clockOut: string | null, dognbetaling = false): ClockRecord {
    return {$key: key, clockIn: at(clockIn), clockOut: clockOut ? at(clockOut) : null, dognbetaling};
  }

  function trip(key: string, start: string): Trip {
    return {
      $key: key, start: at(start), end: at(start).add(2, 'hours'), name: 'Tur',
      drivers: ['d1'], vehicles: [], deleted: false,
    };
  }

  function create(opts: {records?: ClockRecord[]; trips?: Trip[]; publicDates?: string[]} = {}) {
    TestBed.configureTestingModule({
      imports: [PayPeriodReportComponent],
      providers: [
        {
          provide: DataStore,
          useValue: {
            getTrips: () => of(opts.trips ?? []),
            getClockRecords: () => of(opts.records ?? []),
            getPublicDatesInRange: () => of(opts.publicDates ?? []),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PayPeriodReportComponent);
    fixture.componentRef.setInput('driverKey', 'd1');
    fixture.componentRef.setInput('periodStart', PERIOD_START);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('splits the fortnight into its two ISO weeks, seven days each', () => {
    const report = create().componentInstance.report()!;

    expect(report.weeks.map(w => w.weekNumber)).toEqual([32, 33]);
    expect(report.weeks.map(w => w.days.length)).toEqual([7, 7]);
  });

  it('shows every day of the period, including ones with nothing reported', () => {
    // Otherwise the day heading's "+" button has nowhere to attach for a first record.
    const report = create({records: [record('r1', '2026-08-03 08:00', '2026-08-03 16:00')]}).componentInstance.report()!;

    const days = report.weeks.flatMap(w => w.days);
    expect(days.length).toBe(14);
    expect(days.filter(d => d.records.length === 0).length).toBe(13);
  });

  it('totals a week and the whole period from the records inside them', () => {
    const report = create({
      records: [
        record('r1', '2026-08-03 08:00', '2026-08-03 16:30'),   // 8:30, week 32
        record('r2', '2026-08-04 08:00', '2026-08-04 12:00'),   // 4:00, week 32
        record('r3', '2026-08-11 06:00', '2026-08-11 14:00'),   // 8:00, week 33
      ],
    }).componentInstance.report()!;

    expect(report.weeks[0].totalLabel).toBe('12:30');
    expect(report.weeks[1].totalLabel).toBe('8:00');
    expect(report.totalLabel).toBe('20:30');
  });

  it('counts a døgnbetaling record as days and keeps it out of the hourly total', () => {
    const report = create({
      records: [
        record('r1', '2026-08-03 08:00', '2026-08-03 16:00'),          // 8:00 hourly
        record('r2', '2026-08-05 06:00', '2026-08-07 06:01', true),    // 48:01 → 3 døgn
      ],
    }).componentInstance.report()!;

    expect(report.totalLabel).toBe('8:00');
    expect(report.dognCount).toBe(3);
  });

  it('files a shift that runs past midnight under the day it began, and says where it ended', () => {
    const report = create({records: [record('r1', '2026-08-03 22:00', '2026-08-04 06:00')]}).componentInstance.report()!;

    const days = report.weeks[0].days;
    expect(days[0].records.length).toBe(1);
    expect(days[0].totalLabel).toBe('8:00');
    expect(days[0].records[0].crossesDay).toBe(true);
    expect(days[1].records.length).toBe(0);
  });

  it('marks a record whose end precedes its start as an error worth nothing', () => {
    const report = create({records: [record('r1', '2026-08-03 16:00', '2026-08-03 08:00')]}).componentInstance.report()!;

    const day = report.weeks[0].days[0];
    expect(day.records[0].hasError).toBe(true);
    expect(day.records[0].durationLabel).toBe('Fejl');
    expect(day.totalLabel).toBe('0:00');
  });

  it('shows an open shift as in progress rather than as zero hours', () => {
    const report = create({records: [record('r1', '2026-08-03 08:00', null)]}).componentInstance.report()!;

    expect(report.weeks[0].days[0].records[0].durationLabel).toBe('—');
  });

  // A day the office hasn't published is one it is still moving trips around on, so the trips on
  // it are not yet anyone's to see listed against their hours.
  it('lists a day\'s trips only once that day is published', () => {
    const trips = [trip('t1', '2026-08-03 09:00')];

    const unpublished = create({trips}).componentInstance.report()!;
    expect(unpublished.weeks[0].days[0].trips.length).toBe(0);

    TestBed.resetTestingModule();
    const published = create({trips, publicDates: ['2026-08-03']}).componentInstance.report()!;
    expect(published.weeks[0].days[0].trips.length).toBe(1);
  });

  it('leaves out a published trip belonging to another driver', () => {
    const other = {...trip('t1', '2026-08-03 09:00'), drivers: ['d2']};
    const report = create({trips: [other], publicDates: ['2026-08-03']}).componentInstance.report()!;

    expect(report.weeks[0].days[0].trips.length).toBe(0);
  });

  describe('the clock-record dialogs', () => {
    it('opens the editor for the record and driver the row belongs to', () => {
      const fixture = create();
      const instance = {} as ClockRecordFormComponent;
      const open = vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
        .mockReturnValue({componentInstance: instance} as MatDialogRef<ClockRecordFormComponent>);

      const clockRecord = record('r1', '2026-08-03 08:00', '2026-08-03 16:00');
      fixture.componentInstance.editClockRecord(clockRecord);

      expect(open).toHaveBeenCalled();
      expect(instance.mode).toBe('edit');
      expect(instance.driverKey).toBe('d1');
      expect(instance.record).toBe(clockRecord);
    });

    it('opens the creator pre-filled with the day it was pressed on', () => {
      const fixture = create();
      const instance = {} as ClockRecordFormComponent;
      vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
        .mockReturnValue({componentInstance: instance} as MatDialogRef<ClockRecordFormComponent>);

      fixture.componentInstance.addClockRecord(at('2026-08-06 00:00'));

      expect(instance.driverKey).toBe('d1');
      expect(instance.initialClockIn!.format('YYYY-MM-DD')).toBe('2026-08-06');
    });
  });
});
