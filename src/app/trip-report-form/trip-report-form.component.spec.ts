import {TestBed} from '@angular/core/testing';
import {flushWrites} from '../../test-helpers';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import {EMPTY, of} from 'rxjs';
import moment from 'moment';
import {TripReportFormComponent} from './trip-report-form.component';
import {DataStore} from '../data.service';
import {Trip, TripReport} from '../trip';

describe('TripReportFormComponent', () => {
  let dataStore: {setTripReport: ReturnType<typeof vi.fn>; deleteTripReport: ReturnType<typeof vi.fn>; getDriver: ReturnType<typeof vi.fn>};
  let dialogRefClose: ReturnType<typeof vi.fn>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let confirmed: boolean;

  const tripStart = moment('2026-01-01 09:00', 'YYYY-MM-DD HH:mm');
  const tripEnd = moment('2026-01-01 17:00', 'YYYY-MM-DD HH:mm');
  const trip: Trip = {
    $key: 't1', start: tripStart, end: tripEnd, name: 'Randers tur', drivers: ['d1'], vehicles: ['v1'],
  };

  beforeEach(() => {
    confirmed = true;
    dataStore = {
      setTripReport: vi.fn(() => Promise.resolve()),
      deleteTripReport: vi.fn(() => Promise.resolve()),
      getDriver: vi.fn(() => of({$key: 'd1', displayName: 'Kim'})),
    };
    dialogRefClose = vi.fn();
    snackBarOpen = vi.fn();

    TestBed.configureTestingModule({
      imports: [TripReportFormComponent],
      providers: [
        {provide: DataStore, useValue: dataStore},
        {provide: MatDialogRef, useValue: {close: dialogRefClose, backdropClick: () => EMPTY, keydownEvents: () => EMPTY}},
        {provide: MatSnackBar, useValue: {open: snackBarOpen}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(t: Trip = trip, driverKey = 'd1') {
    const fixture = TestBed.createComponent(TripReportFormComponent);
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
      .mockReturnValue({afterClosed: () => of(confirmed)} as unknown as MatDialogRef<ConfirmDialogComponent>);
    fixture.componentInstance.trip = t;
    fixture.componentInstance.driverKey = driverKey;
    fixture.detectChanges();
    return fixture;
  }

  describe('pre-fill', () => {
    // Start comes from the trip's schedule; Slut deliberately does not. A report is written in
    // two sittings — created when the driver sets off, finished when they get back — so a
    // pre-filled finish time would be one nobody entered, on a trip that hasn't finished. The
    // field seeds itself with the current time on the first tap instead (defaultsToNow in the
    // .html).
    it('defaults start to the trip schedule and leaves the finish blank, when no report exists yet', async () => {
      const fixture = create();
      const c = fixture.componentInstance;
      expect(c.hasExistingReport).toBe(false);
      expect(c.start!.isSame(tripStart)).toBe(true);
      expect(c.end).toBeNull();
    });

    it('pre-fills from an existing report when one is present', async () => {
      const existingStart = moment('2026-01-01 09:15', 'YYYY-MM-DD HH:mm');
      const withReport: Trip = {
        ...trip,
        reports: {
          d1: {
            start: existingStart, startFromCustomer: false, end: null, endFromCustomer: true,
            startKm: 100, startKmFromCustomer: true, endKm: null, endKmFromCustomer: false, note: 'Forsinket',
          },
        },
      };
      const fixture = create(withReport);
      const c = fixture.componentInstance;
      expect(c.hasExistingReport).toBe(true);
      expect(c.start!.isSame(existingStart)).toBe(true);
      expect(c.startKmText).toBe('100');
      expect(c.startKm).toBe(100);
      expect(c.note).toBe('Forsinket');
    });
  });

  // The title names the driver, and the dialog opens from two different lists — so the trip it
  // belongs to has to be on the dialog itself, not left to whatever is behind it.
  describe('naming the trip the report is for', () => {
    it('shows the trip name under the title', () => {
      const fixture = create();

      expect((fixture.nativeElement as HTMLElement).querySelector('.trip-name')?.textContent).toContain('Randers tur');
    });

    // An admin's markup is for the trip lists, where a driver acts on it. Here the name is only
    // saying which report this is, so the markers are stripped rather than rendered — and
    // certainly not left showing as literal asterisks and brackets.
    it('strips an admin\'s highlight and address markup instead of rendering it', () => {
      const fixture = create({...trip, name: 'Randers **VIP** tur [Havnegade 3]'});
      const line = (fixture.nativeElement as HTMLElement).querySelector('.trip-name')!;

      expect(line.textContent).toBe('Randers VIP tur Havnegade 3');
      expect(line.querySelector('a')).toBeNull();
    });
  });

  // The dialog is filled in over two sittings and half-filled for most of that, so nothing in it
  // may change size as values arrive — see the .html/.css around .report-summary and
  // .form-error-slot. Each case renders the state it wants from an existing report, since these
  // are plain properties on an OnPush component: setting one from a test marks nothing dirty,
  // where in the app they arrive through ngModel/valueChange bindings that do.
  describe('a dialog that keeps its size', () => {
    function withReport(report: Partial<TripReport>): Trip {
      return {
        ...trip,
        reports: {
          d1: {
            start: null, startFromCustomer: false, end: null, endFromCustomer: false,
            startKm: null, startKmFromCustomer: false, endKm: null, endKmFromCustomer: false,
            note: '', ...report,
          },
        },
      };
    }

    function html(fixture: ReturnType<typeof create>): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    it('shows the summary line before there is anything to put in it', () => {
      const summary = html(create()).querySelector('.report-summary')!;

      expect(summary.textContent).toContain('—');
    });

    it('fills that same line in once the readings are there, rather than adding one', () => {
      const fixture = create(withReport({
        start: tripStart, end: tripStart.clone().add(2, 'hours'), startKm: 100, endKm: 180,
      }));

      const summaries = html(fixture).querySelectorAll('.report-summary');
      expect(summaries).toHaveLength(1);
      expect(summaries[0].textContent).toContain('2 t 00 min');
      expect(summaries[0].textContent).toContain('80 km');
    });

    it('keeps the error slot in place while there is no error to show', () => {
      const fixture = create();

      expect(html(fixture).querySelector('.form-error-slot')).not.toBeNull();
      expect(html(fixture).querySelector('.app-error')).toBeNull();
    });

    it('puts the message inside that slot rather than beside it', () => {
      const fixture = create(withReport({start: tripStart, end: tripStart.clone().subtract(1, 'hour')}));

      const error = html(fixture).querySelector('.form-error-slot .app-error');
      expect(error?.textContent).toContain('kan ikke være før');
    });
  });

  describe('submit', () => {
    it('saves the report and closes the dialog on success', async () => {
      const fixture = create();
      const c = fixture.componentInstance;
      c.note = 'Alt ok';
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.setTripReport).toHaveBeenCalledWith('t1', 'd1', expect.objectContaining({note: 'Alt ok'}));
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does not submit when end is before start', async () => {
      const fixture = create();
      const c = fixture.componentInstance;
      c.end = c.start!.clone().subtract(1, 'hour');
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.setTripReport).not.toHaveBeenCalled();
      expect(c.error()).toBe('"Slut" kan ikke være før "Start".');
    });

    it('does not submit when endKm is less than startKm', async () => {
      const fixture = create();
      const c = fixture.componentInstance;
      c.startKmText = '500';
      c.endKmText = '400';
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.setTripReport).not.toHaveBeenCalled();
    });

    it('parses km readings with either decimal separator', async () => {
      const fixture = create();
      const c = fixture.componentInstance;
      c.startKmText = '1234,5';
      c.endKmText = '1240.5';
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.setTripReport).toHaveBeenCalledWith('t1', 'd1', expect.objectContaining({startKm: 1234.5, endKm: 1240.5}));
    });

    it('does not submit when a km reading is not a number', async () => {
      const fixture = create();
      const c = fixture.componentInstance;
      c.startKmText = 'abc';
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.setTripReport).not.toHaveBeenCalled();
      expect(c.error()).toBe('Angiv et gyldigt tal for "Triptæller start".');
    });

    it('does not submit a negative km reading', async () => {
      const fixture = create();
      const c = fixture.componentInstance;
      c.endKmText = '-5';
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.setTripReport).not.toHaveBeenCalled();
      expect(c.error()).toBe('Angiv et gyldigt tal for "Triptæller slut".');
    });

    it('shows a snackbar and leaves the dialog open when the write fails', async () => {
      dataStore.setTripReport.mockReturnValue(Promise.reject(new Error('offline')));
      const fixture = create();
      fixture.componentInstance.onSubmit();
      await fixture.whenStable();
      await flushWrites();
      expect(snackBarOpen).toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the report and closes the dialog when the confirm dialog is accepted', async () => {
      confirmed = true;
      const fixture = create();
      fixture.componentInstance.deleteReport();
      expect(dataStore.deleteTripReport).toHaveBeenCalledWith('t1', 'd1');
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does nothing when the confirm dialog is declined', async () => {
      confirmed = false;
      const fixture = create();
      fixture.componentInstance.deleteReport();
      expect(dataStore.deleteTripReport).not.toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });
});
