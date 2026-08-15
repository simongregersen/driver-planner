import {TestBed} from '@angular/core/testing';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import {of} from 'rxjs';
import moment from 'moment';
import {DriverFormComponent} from './driver-form.component';
import {DataStore} from '../data.service';
import {Driver} from '../driver';

describe('DriverFormComponent', () => {
  let dataStore: {updateDriver: ReturnType<typeof vi.fn>; addDriver: ReturnType<typeof vi.fn>; deleteDriver: ReturnType<typeof vi.fn>};
  let dialogRefClose: ReturnType<typeof vi.fn>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let confirmed: boolean;

  const driver: Driver = {
    $key: 'd1', displayName: 'Kim', name: 'Kim Hansen', birthday: moment('1980-01-01'), deleted: false,
  };

  beforeEach(() => {
    confirmed = true;
    dataStore = {
      updateDriver: vi.fn(() => Promise.resolve()),
      addDriver: vi.fn(() => Promise.resolve()),
      deleteDriver: vi.fn(() => Promise.resolve()),
    };
    dialogRefClose = vi.fn();
    snackBarOpen = vi.fn();

    TestBed.configureTestingModule({
      imports: [DriverFormComponent],
      providers: [
        {provide: DataStore, useValue: dataStore},
        {provide: MatDialogRef, useValue: {close: dialogRefClose}},
        {provide: MatSnackBar, useValue: {open: snackBarOpen}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(mode: 'create' | 'edit', d?: Driver) {
    const fixture = TestBed.createComponent(DriverFormComponent);
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
      .mockReturnValue({afterClosed: () => of(confirmed)} as unknown as MatDialogRef<ConfirmDialogComponent>);
    fixture.componentInstance.mode = mode;
    if (d) fixture.componentInstance.driver = d;
    fixture.detectChanges();
    return fixture;
  }

  describe('create', () => {
    it('adds the driver with form values and closes the dialog on success', async () => {
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.driverForm.setValue({displayName: 'Jan', name: 'Jan Poulsen', birthday: null});
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addDriver).toHaveBeenCalledWith('Jan', 'Jan Poulsen', null);
      expect(dialogRefClose).toHaveBeenCalled();
      expect(snackBarOpen).not.toHaveBeenCalled();
    });

    it('shows a snackbar and leaves the dialog open when the write fails', async () => {
      dataStore.addDriver.mockReturnValue(Promise.reject(new Error('offline')));
      const fixture = create('create');
      fixture.componentInstance.driverForm.setValue({displayName: 'Jan', name: 'Jan Poulsen', birthday: null});
      fixture.componentInstance.onSubmit();
      await fixture.whenStable();
      expect(snackBarOpen).toHaveBeenCalled();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });

  describe('edit', () => {
    it('pre-fills the form from the existing driver', () => {
      const fixture = create('edit', driver);
      const val = fixture.componentInstance.driverForm.value;
      expect(val.displayName).toBe('Kim');
      expect(val.name).toBe('Kim Hansen');
    });

    it('updates the existing driver and closes the dialog on success', async () => {
      const fixture = create('edit', driver);
      const c = fixture.componentInstance;
      c.driverForm.controls['displayName'].setValue('Kim H.');
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.updateDriver).toHaveBeenCalledWith(driver, expect.objectContaining({displayName: 'Kim H.'}));
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('shows a snackbar and leaves the dialog open when the update fails', async () => {
      dataStore.updateDriver.mockReturnValue(Promise.reject(new Error('denied')));
      const fixture = create('edit', driver);
      fixture.componentInstance.onSubmit();
      await fixture.whenStable();
      expect(snackBarOpen).toHaveBeenCalled();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the driver and closes the dialog when the confirm dialog is accepted', () => {
      confirmed = true;
      const fixture = create('edit', driver);
      fixture.componentInstance.deleteDriver();
      expect(dataStore.deleteDriver).toHaveBeenCalledWith(driver);
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does nothing when the confirm dialog is declined', () => {
      confirmed = false;
      const fixture = create('edit', driver);
      fixture.componentInstance.deleteDriver();
      expect(dataStore.deleteDriver).not.toHaveBeenCalled();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });
});
