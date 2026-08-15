import {TestBed} from '@angular/core/testing';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import {of} from 'rxjs';
import moment from 'moment';
import {FuelReportFormComponent} from './fuel-report-form.component';
import {DataStore} from '../data.service';
import {FuelReport} from '../fuel-report';
import {Vehicle} from '../vehicle';

describe('FuelReportFormComponent', () => {
  let dataStore: {
    updateFuelReport: ReturnType<typeof vi.fn>; addFuelReport: ReturnType<typeof vi.fn>; removeFuelReport: ReturnType<typeof vi.fn>;
    getAllVehicles: ReturnType<typeof vi.fn>; getAllDrivers: ReturnType<typeof vi.fn>;
  };
  let dialogRefClose: ReturnType<typeof vi.fn>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let confirmed: boolean;

  const vehicle: Vehicle = {$key: 'v1', displayName: 'Bus 1', brand: '', regNo: '', latestInspection: null, isRutebus: false, deleted: false};
  const record: FuelReport = {$key: 'r1', date: moment('2026-01-01'), driverKey: 'd1', odometerKm: 1000, liters: 45.5, note: 'Fuld tank'};

  beforeEach(() => {
    confirmed = true;
    dataStore = {
      updateFuelReport: vi.fn(() => Promise.resolve()),
      addFuelReport: vi.fn(() => Promise.resolve()),
      removeFuelReport: vi.fn(() => Promise.resolve()),
      getAllVehicles: vi.fn(() => of([vehicle])),
      getAllDrivers: vi.fn(() => of([])),
    };
    dialogRefClose = vi.fn();
    snackBarOpen = vi.fn();

    TestBed.configureTestingModule({
      imports: [FuelReportFormComponent],
      providers: [
        {provide: DataStore, useValue: dataStore},
        {provide: MatDialogRef, useValue: {close: dialogRefClose}},
        {provide: MatSnackBar, useValue: {open: snackBarOpen}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(mode: 'create' | 'edit', opts: Partial<FuelReportFormComponent> = {}) {
    const fixture = TestBed.createComponent(FuelReportFormComponent);
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
      .mockReturnValue({afterClosed: () => of(confirmed)} as unknown as MatDialogRef<ConfirmDialogComponent>);
    const c = fixture.componentInstance;
    c.mode = mode;
    Object.assign(c, opts);
    fixture.detectChanges();
    return fixture;
  }

  describe('create', () => {
    it('adds a fuel report with a comma decimal separator parsed correctly', async () => {
      const fixture = create('create', {driverKey: 'd1'});
      const c = fixture.componentInstance;
      c.fuelReportForm.setValue({vehicleKey: 'v1', driverKey: null, date: moment('2026-02-01'), odometerKm: '1234', liters: '45,5', note: ''});
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addFuelReport).toHaveBeenCalledWith('v1', expect.objectContaining({driverKey: 'd1', odometerKm: 1234, liters: 45.5}));
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('also accepts a period decimal separator', async () => {
      const fixture = create('create', {driverKey: 'd1'});
      const c = fixture.componentInstance;
      c.fuelReportForm.setValue({vehicleKey: 'v1', driverKey: null, date: moment('2026-02-01'), odometerKm: '1234', liters: '45.5', note: ''});
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addFuelReport).toHaveBeenCalledWith('v1', expect.objectContaining({liters: 45.5}));
    });

    it('requires a driver picker when no driverKey was supplied up front', () => {
      const fixture = create('create');
      expect(fixture.componentInstance.needsDriverPicker).toBe(true);
      expect(fixture.componentInstance.fuelReportForm.controls['driverKey'].hasError('required')).toBe(true);
    });

    it('does not submit an invalid (non-numeric) reading', async () => {
      const fixture = create('create', {driverKey: 'd1'});
      const c = fixture.componentInstance;
      c.fuelReportForm.setValue({vehicleKey: 'v1', driverKey: null, date: moment('2026-02-01'), odometerKm: 'not-a-number', liters: '45,5', note: ''});
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addFuelReport).not.toHaveBeenCalled();
    });

    it('shows a snackbar and leaves the dialog open when the write fails', async () => {
      dataStore.addFuelReport.mockReturnValue(Promise.reject(new Error('offline')));
      const fixture = create('create', {driverKey: 'd1'});
      const c = fixture.componentInstance;
      c.fuelReportForm.setValue({vehicleKey: 'v1', driverKey: null, date: moment('2026-02-01'), odometerKm: '1234', liters: '45,5', note: ''});
      c.onSubmit();
      await fixture.whenStable();
      expect(snackBarOpen).toHaveBeenCalled();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });

  describe('edit', () => {
    it('pre-fills the form with comma-formatted decimals and resolves the vehicle name', async () => {
      const fixture = create('edit', {vehicleKey: 'v1', record});
      await fixture.whenStable();
      const val = fixture.componentInstance.fuelReportForm.value;
      expect(val.odometerKm).toBe('1000');
      expect(val.liters).toBe('45,5');
      expect(fixture.componentInstance.existingVehicleName).toBe('Bus 1');
    });

    it('updates the report and closes the dialog on success', async () => {
      const fixture = create('edit', {vehicleKey: 'v1', record});
      const c = fixture.componentInstance;
      c.fuelReportForm.controls['liters'].setValue('50');
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.updateFuelReport).toHaveBeenCalledWith('v1', record, expect.objectContaining({liters: 50}));
      expect(dialogRefClose).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('removes the report and closes the dialog when the confirm dialog is accepted', () => {
      confirmed = true;
      const fixture = create('edit', {vehicleKey: 'v1', record});
      fixture.componentInstance.deleteReport();
      expect(dataStore.removeFuelReport).toHaveBeenCalledWith('v1', record);
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does nothing when the confirm dialog is declined', () => {
      confirmed = false;
      const fixture = create('edit', {vehicleKey: 'v1', record});
      fixture.componentInstance.deleteReport();
      expect(dataStore.removeFuelReport).not.toHaveBeenCalled();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });
});
