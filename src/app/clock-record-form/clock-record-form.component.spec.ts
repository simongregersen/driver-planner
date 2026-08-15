import {TestBed} from '@angular/core/testing';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import {of} from 'rxjs';
import moment from 'moment';
import {ClockRecordFormComponent} from './clock-record-form.component';
import {DataStore} from '../data.service';
import {ClockRecord} from '../clock-record';

describe('ClockRecordFormComponent', () => {
  let dataStore: {updateClockRecord: ReturnType<typeof vi.fn>; addClockRecord: ReturnType<typeof vi.fn>; removeClockRecord: ReturnType<typeof vi.fn>};
  let dialogRefClose: ReturnType<typeof vi.fn>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let confirmed: boolean;

  const record: ClockRecord = {$key: 'c1', clockIn: moment('2026-01-01 08:00', 'YYYY-MM-DD HH:mm'), clockOut: moment('2026-01-01 16:00', 'YYYY-MM-DD HH:mm'), note: 'Vagt'};

  beforeEach(() => {
    confirmed = true;
    dataStore = {
      updateClockRecord: vi.fn(() => Promise.resolve()),
      addClockRecord: vi.fn(() => Promise.resolve()),
      removeClockRecord: vi.fn(() => Promise.resolve()),
    };
    dialogRefClose = vi.fn();
    snackBarOpen = vi.fn();

    TestBed.configureTestingModule({
      imports: [ClockRecordFormComponent],
      providers: [
        {provide: DataStore, useValue: dataStore},
        {provide: MatDialogRef, useValue: {close: dialogRefClose}},
        {provide: MatSnackBar, useValue: {open: snackBarOpen}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(mode: 'create' | 'edit', opts: Partial<ClockRecordFormComponent> = {}) {
    const fixture = TestBed.createComponent(ClockRecordFormComponent);
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
      .mockReturnValue({afterClosed: () => of(confirmed)} as unknown as MatDialogRef<ConfirmDialogComponent>);
    const c = fixture.componentInstance;
    c.mode = mode;
    c.driverKey = 'd1';
    Object.assign(c, opts);
    fixture.detectChanges();
    return fixture;
  }

  describe('create', () => {
    it('adds a clock-in record and closes the dialog on success', async () => {
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.clockIn = moment('2026-01-01 08:00', 'YYYY-MM-DD HH:mm');
      c.note = 'Morgenvagt';
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addClockRecord).toHaveBeenCalledWith('d1', c.clockIn, 'Morgenvagt', null, false);
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does not submit when clockOut is before clockIn', async () => {
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.clockIn = moment('2026-01-01 16:00', 'YYYY-MM-DD HH:mm');
      c.clockOut = moment('2026-01-01 08:00', 'YYYY-MM-DD HH:mm');
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addClockRecord).not.toHaveBeenCalled();
      expect(c.error()).toBe('"Slut" kan ikke være før "Start".');
    });

    it('shows a snackbar and leaves the dialog open when the write fails', async () => {
      dataStore.addClockRecord.mockReturnValue(Promise.reject(new Error('offline')));
      const fixture = create('create');
      fixture.componentInstance.clockIn = moment('2026-01-01 08:00', 'YYYY-MM-DD HH:mm');
      fixture.componentInstance.onSubmit();
      await fixture.whenStable();
      expect(snackBarOpen).toHaveBeenCalled();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });

  describe('edit', () => {
    it('pre-fills clockIn/clockOut/note from the existing record', () => {
      const fixture = create('edit', {record});
      const c = fixture.componentInstance;
      expect(c.clockIn!.isSame(record.clockIn)).toBe(true);
      expect(c.clockOut!.isSame(record.clockOut!)).toBe(true);
      expect(c.note).toBe('Vagt');
      expect(c.dognbetaling).toBe(false);
    });

    it('pre-fills dognbetaling from the existing record', () => {
      const fixture = create('edit', {record: {...record, dognbetaling: true}});
      expect(fixture.componentInstance.dognbetaling).toBe(true);
    });

    it('updates the record and closes the dialog on success', async () => {
      const fixture = create('edit', {record});
      const c = fixture.componentInstance;
      c.note = 'Opdateret';
      c.dognbetaling = true;
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.updateClockRecord).toHaveBeenCalledWith('d1', record, expect.objectContaining({note: 'Opdateret', dognbetaling: true}));
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('clearClockOut() clears the end time', () => {
      const fixture = create('edit', {record});
      const c = fixture.componentInstance;
      c.clearClockOut();
      expect(c.clockOut).toBeNull();
    });
  });

  describe('delete', () => {
    it('removes the record and closes the dialog when the confirm dialog is accepted', () => {
      confirmed = true;
      const fixture = create('edit', {record});
      fixture.componentInstance.confirmDelete();
      expect(dataStore.removeClockRecord).toHaveBeenCalledWith('d1', record);
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does nothing when the confirm dialog is declined', () => {
      confirmed = false;
      const fixture = create('edit', {record});
      fixture.componentInstance.confirmDelete();
      expect(dataStore.removeClockRecord).not.toHaveBeenCalled();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });
});
