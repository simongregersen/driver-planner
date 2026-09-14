import {TestBed} from '@angular/core/testing';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';
import {of} from 'rxjs';
import moment from 'moment';
import {TimeReportComponent} from './time-report.component';
import {PayPeriodDialogComponent} from '../pay-period-dialog/pay-period-dialog.component';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {PageHeaderService} from '../page-header.service';
import {Driver} from '../driver';
import {ClockRecord} from '../clock-record';
import {payPeriodFromKey, shiftPayPeriod} from '../pay-period';

/**
 * Timeseddel's two branches. A driver gets their own timesheet for one period; an admin gets the
 * payroll overview — every driver against the last PAY_PERIOD_COLUMNS pay periods, with the ones
 * that have been settled marked Udbetalt.
 *
 * The joins pinned here are the ones neither the data layer nor pay-period.ts can make alone:
 * which driver's records land in which cell, which drivers get a row at all, and what the period
 * navigation does with a window several periods wide.
 */
describe('TimeReportComponent', () => {
  // 2026-08-06 falls in the period starting Monday 2026-08-03 (ISO week 32, even).
  const TODAY = moment('2026-08-06', 'YYYY-MM-DD');
  const at = (value: string) => moment(value, 'YYYY-MM-DD HH:mm');

  function driver(key: string, displayName: string, deleted = false, external = false): Driver {
    return {$key: key, displayName, name: displayName, birthday: null, deleted, external};
  }

  const KIM = driver('d1', 'Kim');
  const BENTE = driver('d2', 'Bente');

  function record(key: string, driverKey: string, clockIn: string, clockOut: string, dognbetaling = false) {
    return {$key: key, driverKey, clockIn: at(clockIn), clockOut: at(clockOut), dognbetaling} as ClockRecord & {driverKey: string};
  }

  let setPeriodPaid: ReturnType<typeof vi.fn>;

  function create(opts: {
    isAdmin?: boolean;
    ownDriver?: Driver | null;
    drivers?: Driver[];
    records?: (ClockRecord & {driverKey: string})[];
    paid?: string[];
  } = {}) {
    setPeriodPaid = vi.fn(() => Promise.resolve());
    TestBed.configureTestingModule({
      imports: [TimeReportComponent],
      providers: [
        {
          provide: DataStore,
          useValue: {
            getAllDrivers: () => of(opts.drivers ?? [KIM, BENTE]),
            getClockRecordsForDrivers: () => of(opts.records ?? []),
            getPaidPeriods: () => of(opts.paid ?? []),
            setPeriodPaid,
            // Only reached when the driver branch renders the real report component.
            getTrips: () => of([]),
            getClockRecords: () => of([]),
            getPublicDatesInRange: () => of([]),
          },
        },
        {
          provide: UserService,
          useValue: {
            isAdmin$: of(opts.isAdmin ?? false),
            driverProfile$: of(opts.ownDriver ?? null),
          },
        },
        {provide: PageHeaderService, useValue: {set: () => undefined}},
        {provide: MatSnackBar, useValue: {open: () => undefined}},
      ],
    });
    const fixture = TestBed.createComponent(TimeReportComponent);
    fixture.componentInstance.period.set(
      // Pin the window rather than letting it follow the real clock, so the expected period keys
      // below don't drift by a fortnight.
      {start: moment('2026-08-03'), end: moment('2026-08-16'), key: '2026-08-03', label: 'Uge 32-33'}
    );
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('as an admin', () => {
    it('shows a window of pay periods, oldest first, ending with the one selected', () => {
      const c = create({isAdmin: true}).componentInstance;

      expect(c.periods().map(p => p.key)).toEqual([
        '2026-04-27', '2026-05-11', '2026-05-25', '2026-06-08',
        '2026-06-22', '2026-07-06', '2026-07-20', '2026-08-03',
      ]);
      expect(c.periods().at(-1)!.label).toBe('Uge 32-33');
    });

    it('gives every driver a row and every period a cell', () => {
      const rows = create({isAdmin: true}).componentInstance.overviewRows();

      expect(rows.map(r => r.driver.displayName)).toEqual(['Kim', 'Bente']);
      expect(rows.map(r => r.cells.length)).toEqual([8, 8]);
    });

    it('sums each driver\'s hours into the period the records fall in', () => {
      const rows = create({
        isAdmin: true,
        records: [
          record('r1', 'd1', '2026-08-03 08:00', '2026-08-03 16:30'),   // Kim, current period
          record('r2', 'd1', '2026-08-11 08:00', '2026-08-11 12:00'),   // Kim, same period
          record('r3', 'd2', '2026-07-21 08:00', '2026-07-21 15:00'),   // Bente, one period back
        ],
      }).componentInstance.overviewRows();

      expect(rows[0].cells.at(-1)!.hoursLabel).toBe('12:30');
      expect(rows[0].cells.at(-2)!.hoursLabel).toBe('—');
      expect(rows[1].cells.at(-2)!.hoursLabel).toBe('7:00');
      expect(rows[1].cells.at(-1)!.isEmpty).toBe(true);
    });

    it('shows døgn alongside the hours, and only when the period has any', () => {
      const rows = create({
        isAdmin: true,
        records: [
          record('r1', 'd1', '2026-08-03 08:00', '2026-08-03 16:00'),
          record('r2', 'd1', '2026-08-05 06:00', '2026-08-07 06:01', true),
        ],
      }).componentInstance.overviewRows();

      const cell = rows[0].cells.at(-1)!;
      expect(cell.hoursLabel).toBe('8:00');
      expect(cell.dognLabel).toBe('3 døgn');
      expect(rows[1].cells.at(-1)!.dognLabel).toBeNull();
    });

    // Clock-in, not clock-out: a shift begun on the last night of a period is that period's work.
    it('files a shift crossing the period boundary under the period it began in', () => {
      const rows = create({
        isAdmin: true,
        records: [record('r1', 'd1', '2026-08-16 23:00', '2026-08-17 07:00')],
      }).componentInstance.overviewRows();

      expect(rows[0].cells.at(-1)!.hoursLabel).toBe('8:00');
    });

    it('marks the cells that have been settled', () => {
      const rows = create({isAdmin: true, paid: ['d1/2026-08-03', 'd2/2026-07-20']}).componentInstance.overviewRows();

      expect(rows[0].cells.at(-1)!.paid).toBe(true);
      expect(rows[0].cells.at(-2)!.paid).toBe(false);
      expect(rows[1].cells.at(-2)!.paid).toBe(true);
      expect(rows[1].cells.at(-1)!.paid).toBe(false);
    });

    it('toggles a cell\'s mark through the store', () => {
      const fixture = create({isAdmin: true, paid: ['d1/2026-08-03']});
      const c = fixture.componentInstance;
      const row = c.overviewRows()[0];

      c.togglePaid(row.driver, row.cells.at(-2)!);
      expect(setPeriodPaid).toHaveBeenCalledWith('d1', '2026-07-20', true);

      c.togglePaid(row.driver, row.cells.at(-1)!);
      expect(setPeriodPaid).toHaveBeenCalledWith('d1', '2026-08-03', false);
    });

    it('opens the period dialog for the driver and period whose cell was clicked', () => {
      const fixture = create({isAdmin: true, paid: ['d1/2026-08-03']});
      const c = fixture.componentInstance;
      const instance = {paid: {set: vi.fn()}} as unknown as PayPeriodDialogComponent;
      vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
        .mockReturnValue({componentInstance: instance} as MatDialogRef<PayPeriodDialogComponent>);

      const row = c.overviewRows()[0];
      c.openPeriod(row.driver, row.cells.at(-1)!);

      expect(instance.driverKey).toBe('d1');
      expect(instance.driverName).toBe('Kim');
      expect(instance.period.key).toBe('2026-08-03');
      expect(instance.paid.set).toHaveBeenCalledWith(true);
    });

    // A driver who has left still has to be paid for the periods they worked, and with the
    // per-driver admin view gone there is nowhere else to reach them from.
    describe('a soft-deleted driver', () => {
      const GONE = driver('d3', 'Ove', true);

      it('keeps their row while they still have hours inside the window', () => {
        const rows = create({
          isAdmin: true,
          drivers: [KIM, GONE],
          records: [record('r1', 'd3', '2026-07-21 08:00', '2026-07-21 16:00')],
        }).componentInstance.overviewRows();

        expect(rows.map(r => r.driver.$key)).toEqual(['d1', 'd3']);
      });

      it('keeps their row while an Udbetalt mark inside the window still refers to them', () => {
        const rows = create({isAdmin: true, drivers: [KIM, GONE], paid: ['d3/2026-07-20']}).componentInstance.overviewRows();

        expect(rows.map(r => r.driver.$key)).toEqual(['d1', 'd3']);
      });

      it('drops their row once the window has moved past them', () => {
        const rows = create({
          isAdmin: true,
          drivers: [KIM, GONE],
          // A mark from long before the six visible periods.
          paid: ['d3/2024-01-01'],
        }).componentInstance.overviewRows();

        expect(rows.map(r => r.driver.$key)).toEqual(['d1']);
      });
    });

    // Unlike a soft-deleted driver, hours or an Udbetalt mark don't earn an external driver a
    // row back — see TimeReportComponent.overviewDrivers.
    it('excludes an external driver even with hours and an Udbetalt mark inside the window', () => {
      const SUB = driver('d3', 'Ove', false, true);
      const rows = create({
        isAdmin: true,
        drivers: [KIM, SUB],
        records: [record('r1', 'd3', '2026-07-21 08:00', '2026-07-21 16:00')],
        paid: ['d3/2026-07-20'],
      }).componentInstance.overviewRows();

      expect(rows.map(r => r.driver.$key)).toEqual(['d1']);
    });

    // A screenful at a time, not one period: the window is what the admin is looking at, so
    // Forrige has to leave nothing between where they were and where they land.
    it('pages a whole screenful of periods at a time, with no gap and no overlap', () => {
      const c = create({isAdmin: true}).componentInstance;
      const before = c.periods().map(p => p.key);

      c.previousPeriod();
      const after = c.periods().map(p => p.key);

      expect(after.at(-1)).toBe('2026-04-13');
      expect(after.length).toBe(before.length);
      expect(after.filter(k => before.includes(k))).toEqual([]);
      // The two windows are contiguous: the one paged away from starts where this one ends.
      expect(shiftPayPeriod(payPeriodFromKey(after.at(-1)!), 1).key).toBe(before[0]);

      c.nextPeriod();
      expect(c.periods().map(p => p.key)).toEqual(before);
    });

    it('covers the whole visible window in the page header, not just one period', () => {
      const c = create({isAdmin: true}).componentInstance;

      expect(c.headerFrom().format('YYYY-MM-DD')).toBe('2026-04-27');
    });
  });

  describe('as a driver', () => {
    it('reports on their own key, with no overview fetched', () => {
      const c = create({ownDriver: KIM}).componentInstance;

      expect(c.driverKey()).toBe('d1');
      expect(c.overviewRows()).toEqual([]);
      expect(c.loadingOverview()).toBe(false);
    });

    it('pages one period at a time', () => {
      const c = create({ownDriver: KIM}).componentInstance;

      c.previousPeriod();
      expect(c.period().key).toBe('2026-07-20');

      c.nextPeriod();
      expect(c.period().key).toBe('2026-08-03');
    });

    it('covers only their own period in the page header', () => {
      const c = create({ownDriver: KIM}).componentInstance;

      expect(c.headerFrom().format('YYYY-MM-DD')).toBe('2026-08-03');
    });

    it('has no driver key at all until their profile has been read', () => {
      expect(create({ownDriver: null}).componentInstance.driverKey()).toBeNull();
    });
  });

  it('knows whether it is showing the current period', () => {
    const fixture = create({isAdmin: true});
    const c = fixture.componentInstance;

    expect(c.isCurrentPeriod()).toBe(moment().isSame(TODAY, 'day'));

    c.goToCurrentPeriod();
    expect(c.isCurrentPeriod()).toBe(true);
  });
});
