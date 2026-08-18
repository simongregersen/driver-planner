import {TestBed} from '@angular/core/testing';
import {signal} from '@angular/core';
import {flushWrites} from '../test-helpers';
import {MatDialog} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';
import {Subject, of} from 'rxjs';
import moment from 'moment';
import {TripEditingService} from './trip-editing.service';
import {DataStore} from './data.service';
import {Driver} from './driver';
import {Vehicle} from './vehicle';
import {NewTrip, Trip} from './trip';

describe('TripEditingService', () => {
  let dataStore: {
    updateTrip: ReturnType<typeof vi.fn>; addTrip: ReturnType<typeof vi.fn>; removeTrip: ReturnType<typeof vi.fn>;
    getAllDrivers: ReturnType<typeof vi.fn>; getAllVehicles: ReturnType<typeof vi.fn>;
  };
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let dialogOpen: ReturnType<typeof vi.fn>;

  const driver: Driver = {$key: 'd1', displayName: 'Kim', name: 'Kim Hansen', birthday: null, deleted: false};
  const vehicle: Vehicle = {$key: 'v1', displayName: 'Bus 1', brand: '', regNo: '', latestInspection: null, isRutebus: false, deleted: false};
  const trip: Trip = {$key: 't1', name: 'Tur', start: moment('2026-01-01 09:00', 'YYYY-MM-DD HH:mm'), end: null, drivers: ['d1'], vehicles: ['v1']};

  beforeEach(() => {
    dataStore = {
      updateTrip: vi.fn(() => Promise.resolve()),
      addTrip: vi.fn(() => Promise.resolve()),
      removeTrip: vi.fn(() => Promise.resolve()),
      getAllDrivers: vi.fn(() => of([driver])),
      getAllVehicles: vi.fn(() => of([vehicle])),
    };
    snackBarOpen = vi.fn();
    dialogOpen = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        TripEditingService,
        {provide: DataStore, useValue: dataStore},
        {provide: MatDialog, useValue: {open: dialogOpen}},
        {provide: MatSnackBar, useValue: {open: snackBarOpen}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  // TripFormComponent's own save/remove outputs, faked as plain Subjects — good enough since
  // TripEditingService only ever calls .subscribe() on them, same as the real outputs.
  function fakeTripFormDialogRef() {
    const save = new Subject<NewTrip>();
    const remove = new Subject<void>();
    const close = vi.fn();
    // `saving` mirrors TripFormComponent's own signal — closeOnSave drives it while the
    // write is in flight, so the fake has to carry it too.
    dialogOpen.mockReturnValue({componentInstance: {save, remove, saving: signal(false)}, close});
    return {save, remove, close};
  }

  function mockConfirmDialog(confirmed: boolean) {
    dialogOpen.mockReturnValue({afterClosed: () => of(confirmed)});
  }

  describe('edit', () => {
    it('updates the trip and closes the dialog once the form emits save', async () => {
      const {save, close} = fakeTripFormDialogRef();
      const service = TestBed.inject(TripEditingService);
      service.edit(trip);
      const updates = {name: 'Ny tur'} as NewTrip;
      save.next(updates);
      await Promise.resolve();
      expect(dataStore.updateTrip).toHaveBeenCalledWith(trip, updates);
      await flushWrites();
      expect(close).toHaveBeenCalled();
    });

    it('shows a snackbar and does not close when the update fails', async () => {
      dataStore.updateTrip.mockReturnValue(Promise.reject(new Error('offline')));
      const {save, close} = fakeTripFormDialogRef();
      const service = TestBed.inject(TripEditingService);
      service.edit(trip);
      save.next({} as NewTrip);
      await Promise.resolve();
      await flushWrites();
      expect(snackBarOpen).toHaveBeenCalled();
      await flushWrites();
      expect(close).not.toHaveBeenCalled();
    });

    it('removes the trip and closes the dialog once the form emits remove', async () => {
      const {remove, close} = fakeTripFormDialogRef();
      const service = TestBed.inject(TripEditingService);
      service.edit(trip);
      remove.next();
      await Promise.resolve();
      expect(dataStore.removeTrip).toHaveBeenCalledWith(trip);
      await flushWrites();
      expect(close).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('adds the trip and closes the dialog once the form emits save', async () => {
      const {save, close} = fakeTripFormDialogRef();
      const service = TestBed.inject(TripEditingService);
      service.create(moment('2026-02-01'));
      const newTrip = {name: 'Ny tur'} as NewTrip;
      save.next(newTrip);
      await Promise.resolve();
      expect(dataStore.addTrip).toHaveBeenCalledWith(newTrip);
      await flushWrites();
      expect(close).toHaveBeenCalled();
    });
  });

  describe('removeDriverFromTrip / removeVehicleFromTrip', () => {
    it('removes the driver from the trip when confirmed', async () => {
      mockConfirmDialog(true);
      const service = TestBed.inject(TripEditingService);
      service.removeDriverFromTrip({trip, driverKey: 'd1'});
      expect(dataStore.updateTrip).toHaveBeenCalledWith(trip, {drivers: [], vehicleAssignments: {}});
    });

    it('does nothing when declined', async () => {
      mockConfirmDialog(false);
      const service = TestBed.inject(TripEditingService);
      service.removeDriverFromTrip({trip, driverKey: 'd1'});
      expect(dataStore.updateTrip).not.toHaveBeenCalled();
    });

    it('removes the vehicle from the trip when confirmed', async () => {
      mockConfirmDialog(true);
      const service = TestBed.inject(TripEditingService);
      service.removeVehicleFromTrip({trip, vehicleKey: 'v1'});
      expect(dataStore.updateTrip).toHaveBeenCalledWith(trip, {vehicles: [], vehicleAssignments: {}});
    });
  });

  describe('removeTrip', () => {
    it('delegates to DataStore.removeTrip', async () => {
      const service = TestBed.inject(TripEditingService);
      service.removeTrip(trip);
      expect(dataStore.removeTrip).toHaveBeenCalledWith(trip);
    });
  });
});
