import {TestBed} from '@angular/core/testing';
import {flushWrites} from '../../test-helpers';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import {EMPTY, of} from 'rxjs';
import {VehicleFormComponent} from './vehicle-form.component';
import {DataStore} from '../data.service';
import {Vehicle} from '../vehicle';

describe('VehicleFormComponent', () => {
  let dataStore: {updateVehicle: ReturnType<typeof vi.fn>; addVehicle: ReturnType<typeof vi.fn>; deleteVehicle: ReturnType<typeof vi.fn>};
  let dialogRefClose: ReturnType<typeof vi.fn>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let confirmed: boolean;

  const vehicle: Vehicle = {
    $key: 'v1', displayName: 'Bus 1', brand: 'Volvo', regNo: 'AB12345',
    latestInspection: null, isRutebus: false, deleted: false,
  };

  beforeEach(() => {
    confirmed = true;
    dataStore = {
      updateVehicle: vi.fn(() => Promise.resolve()),
      addVehicle: vi.fn(() => Promise.resolve()),
      deleteVehicle: vi.fn(() => Promise.resolve()),
    };
    dialogRefClose = vi.fn();
    snackBarOpen = vi.fn();

    TestBed.configureTestingModule({
      imports: [VehicleFormComponent],
      providers: [
        {provide: DataStore, useValue: dataStore},
        {provide: MatDialogRef, useValue: {close: dialogRefClose, backdropClick: () => EMPTY, keydownEvents: () => EMPTY}},
        {provide: MatSnackBar, useValue: {open: snackBarOpen}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(mode: 'create' | 'edit', v?: Vehicle) {
    const fixture = TestBed.createComponent(VehicleFormComponent);
    // MatDialogModule (imported by VehicleFormComponent itself) declares its own `providers:
    // [MatDialog]`, so the component's own injector resolves a DIFFERENT MatDialog instance than
    // TestBed.inject(MatDialog) does at the root — spying via the component's own element
    // injector gets the actual instance `this.dialog` resolves to inside the component.
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
      .mockReturnValue({afterClosed: () => of(confirmed)} as unknown as MatDialogRef<ConfirmDialogComponent>);
    fixture.componentInstance.mode = mode;
    if (v) fixture.componentInstance.vehicle = v;
    fixture.detectChanges();
    return fixture;
  }

  describe('create', () => {
    it('adds the vehicle with form values and closes the dialog on success', async () => {
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.vehicleForm.setValue({displayName: 'Bus 2', brand: 'Scania', regNo: 'XY98765', latestInspection: null, isRutebus: true});
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addVehicle).toHaveBeenCalledWith('Bus 2', 'Scania', 'XY98765', null, true);
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
      await flushWrites();
      expect(snackBarOpen).not.toHaveBeenCalled();
    });

    it('shows a snackbar and leaves the dialog open when the write fails', async () => {
      dataStore.addVehicle.mockReturnValue(Promise.reject(new Error('offline')));
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.vehicleForm.setValue({displayName: 'Bus 2', brand: '', regNo: '', latestInspection: null, isRutebus: false});
      c.onSubmit();
      await fixture.whenStable();
      await flushWrites();
      expect(snackBarOpen).toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });

    it('defaults isRutebus to false and blank text fields to empty strings', async () => {
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.vehicleForm.controls['displayName'].setValue('Bus 3');
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addVehicle).toHaveBeenCalledWith('Bus 3', '', '', null, false);
    });
  });

  describe('edit', () => {
    it('pre-fills the form from the existing vehicle', async () => {
      const fixture = create('edit', vehicle);
      const val = fixture.componentInstance.vehicleForm.value;
      expect(val.displayName).toBe('Bus 1');
      expect(val.brand).toBe('Volvo');
      expect(val.regNo).toBe('AB12345');
      expect(val.isRutebus).toBe(false);
    });

    it('updates the existing vehicle and closes the dialog on success', async () => {
      const fixture = create('edit', vehicle);
      const c = fixture.componentInstance;
      c.vehicleForm.controls['isRutebus'].setValue(true);
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.updateVehicle).toHaveBeenCalledWith(vehicle, expect.objectContaining({isRutebus: true, displayName: 'Bus 1'}));
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('shows a snackbar and leaves the dialog open when the update fails', async () => {
      dataStore.updateVehicle.mockReturnValue(Promise.reject(new Error('denied')));
      const fixture = create('edit', vehicle);
      fixture.componentInstance.onSubmit();
      await fixture.whenStable();
      await flushWrites();
      expect(snackBarOpen).toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes the vehicle and closes the dialog when the confirm dialog is accepted', async () => {
      confirmed = true;
      const fixture = create('edit', vehicle);
      fixture.componentInstance.deleteVehicle();
      expect(dataStore.deleteVehicle).toHaveBeenCalledWith(vehicle);
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does nothing when the confirm dialog is declined', async () => {
      confirmed = false;
      const fixture = create('edit', vehicle);
      fixture.componentInstance.deleteVehicle();
      expect(dataStore.deleteVehicle).not.toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });
});
