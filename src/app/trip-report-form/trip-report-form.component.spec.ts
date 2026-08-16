import {TestBed} from '@angular/core/testing';
import {flushWrites} from '../../test-helpers';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import {EMPTY, of} from 'rxjs';
import moment from 'moment';
import {TripReportFormComponent} from './trip-report-form.component';
import {DataStore} from '../data.service';
import {Trip} from '../trip';

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
    it('defaults start/end to the trip schedule when no report exists yet', async () => {
      const fixture = create();
      const c = fixture.componentInstance;
      expect(c.hasExistingReport).toBe(false);
      expect(c.start!.isSame(tripStart)).toBe(true);
      expect(c.end!.isSame(tripEnd)).toBe(true);
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
      expect(c.startKm).toBe(100);
      expect(c.note).toBe('Forsinket');
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
      c.startKm = 500;
      c.endKm = 400;
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.setTripReport).not.toHaveBeenCalled();
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
