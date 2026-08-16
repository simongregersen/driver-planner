import {TestBed} from '@angular/core/testing';
import {flushWrites} from '../../test-helpers';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import {EMPTY, of} from 'rxjs';
import moment from 'moment';
import {ClockRecordStopComponent} from './clock-record-stop.component';
import {ClockRecordUpdates} from '../clock-record-form/clock-record-form.component';
import {ClockRecord} from '../clock-record';

describe('ClockRecordStopComponent', () => {
  let dialogRefClose: ReturnType<typeof vi.fn>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn<(record: ClockRecord, updates: ClockRecordUpdates) => Promise<unknown>>>;
  let removeRecord: ReturnType<typeof vi.fn<(record: ClockRecord) => Promise<unknown>>>;
  let confirmed: boolean;

  const record: ClockRecord = {$key: 'c1', clockIn: moment().subtract(4, 'hours'), clockOut: null, note: ''};

  beforeEach(() => {
    confirmed = true;
    dialogRefClose = vi.fn();
    snackBarOpen = vi.fn();
    save = vi.fn(() => Promise.resolve());
    removeRecord = vi.fn(() => Promise.resolve());

    TestBed.configureTestingModule({
      imports: [ClockRecordStopComponent],
      providers: [
        {provide: MatDialogRef, useValue: {close: dialogRefClose, backdropClick: () => EMPTY, keydownEvents: () => EMPTY}},
        {provide: MatSnackBar, useValue: {open: snackBarOpen}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create() {
    const fixture = TestBed.createComponent(ClockRecordStopComponent);
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
      .mockReturnValue({afterClosed: () => of(confirmed)} as unknown as MatDialogRef<ConfirmDialogComponent>);
    fixture.detectChanges();
    fixture.componentInstance.open(record, save, removeRecord);
    return fixture;
  }

  it('defaults clockOut to (roughly) now and clockIn/note from the record', async () => {
    const fixture = create();
    const c = fixture.componentInstance;
    expect(c.clockIn!.isSame(record.clockIn)).toBe(true);
    expect(c.clockOut).not.toBeNull();
    // Rounded to the nearest 5 minutes, so it can land up to ~2.5 minutes on either side of now.
    expect(Math.abs(c.clockOut!.diff(moment(), 'minutes'))).toBeLessThanOrEqual(3);
  });

  it('stops the record (calls the supplied save callback) and closes the dialog on success', async () => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.note = 'Aftenvagt';
    c.onSubmit();
    await fixture.whenStable();
    expect(save).toHaveBeenCalledWith(record, expect.objectContaining({clockIn: c.clockIn, note: 'Aftenvagt'}));
    await flushWrites();
    expect(dialogRefClose).toHaveBeenCalled();
  });

  it('does not submit when clockOut is before clockIn', async () => {
    const fixture = create();
    const c = fixture.componentInstance;
    c.clockOut = c.clockIn!.clone().subtract(1, 'hour');
    c.onSubmit();
    await fixture.whenStable();
    expect(save).not.toHaveBeenCalled();
  });

  it('shows a snackbar and leaves the dialog open when the save fails', async () => {
    save.mockReturnValue(Promise.reject(new Error('offline')));
    const fixture = create();
    fixture.componentInstance.onSubmit();
    await fixture.whenStable();
    await flushWrites();
    expect(snackBarOpen).toHaveBeenCalled();
    await flushWrites();
    expect(dialogRefClose).not.toHaveBeenCalled();
  });

  describe('delete', () => {
    it('removes the record and closes the dialog when the confirm dialog is accepted', async () => {
      confirmed = true;
      const fixture = create();
      fixture.componentInstance.confirmDelete();
      expect(removeRecord).toHaveBeenCalledWith(record);
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does nothing when the confirm dialog is declined', async () => {
      confirmed = false;
      const fixture = create();
      fixture.componentInstance.confirmDelete();
      expect(removeRecord).not.toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });
});
