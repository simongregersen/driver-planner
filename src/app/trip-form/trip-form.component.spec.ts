import {TestBed} from '@angular/core/testing';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {EMPTY, of} from 'rxjs';
import moment from 'moment';
import {TripFormComponent} from './trip-form.component';
import {DataStore} from '../data.service';
import {NewTrip, Trip} from '../trip';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';

describe('TripFormComponent', () => {
  let dataStore: {getAllDrivers: ReturnType<typeof vi.fn>; getAllVehicles: ReturnType<typeof vi.fn>; getTrips: ReturnType<typeof vi.fn>};
  let confirmed: boolean;

  beforeEach(() => {
    confirmed = true;
    dataStore = {
      getAllDrivers: vi.fn(() => of([{$key: 'd1', displayName: 'Kim'}])),
      getAllVehicles: vi.fn(() => of([{$key: 'v1', displayName: 'Bus 1'}])),
      getTrips: vi.fn(() => of([])),
    };

    TestBed.configureTestingModule({
      imports: [TripFormComponent],
      providers: [
        {provide: DataStore, useValue: dataStore},
        {provide: MatDialogRef, useValue: {close: vi.fn(), backdropClick: () => EMPTY, keydownEvents: () => EMPTY}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(mode: 'create' | 'edit', opts: Partial<TripFormComponent> = {}) {
    const fixture = TestBed.createComponent(TripFormComponent);
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
      .mockReturnValue({afterClosed: () => of(confirmed)} as unknown as MatDialogRef<ConfirmDialogComponent>);
    const c = fixture.componentInstance;
    c.mode = mode;
    Object.assign(c, opts);
    fixture.detectChanges();
    return fixture;
  }

  describe('create', () => {
    it('emits a save output with the combined date/time and form values', () => {
      const fixture = create('create', {defaultDate: moment('2026-03-01')});
      const c = fixture.componentInstance;
      const emitted: NewTrip[] = [];
      c.save.subscribe(v => emitted.push(v));

      c.tripForm.setValue({
        name: 'Randers tur',
        fromDate: moment('2026-03-01'), fromTime: moment('1970-01-01 09:00', 'YYYY-MM-DD HH:mm'),
        toDate: moment('2026-03-01'), toTime: moment('1970-01-01 12:00', 'YYYY-MM-DD HH:mm'),
        drivers: ['d1'], vehicles: ['v1'], description: 'Note', officeDescription: '', labels: [],
      });
      c.onSubmit();

      expect(emitted).toHaveLength(1);
      expect(emitted[0].name).toBe('Randers tur');
      expect(emitted[0].drivers).toEqual(['d1']);
      expect(emitted[0].start.format('YYYY-MM-DD HH:mm')).toBe('2026-03-01 09:00');
      expect(emitted[0].end!.format('YYYY-MM-DD HH:mm')).toBe('2026-03-01 12:00');
    });

    it('emits a null end when only a start time is given (same-day, no end)', () => {
      const fixture = create('create', {defaultDate: moment('2026-03-01')});
      const c = fixture.componentInstance;
      const emitted: NewTrip[] = [];
      c.save.subscribe(v => emitted.push(v));

      c.tripForm.patchValue({
        name: 'Tur', fromDate: moment('2026-03-01'), fromTime: moment('1970-01-01 09:00', 'YYYY-MM-DD HH:mm'),
      });
      c.onSubmit();

      expect(emitted[0].end).toBeNull();
    });

    it('marks the form invalid when the end time is not after the start time', () => {
      const fixture = create('create', {defaultDate: moment('2026-03-01')});
      const c = fixture.componentInstance;
      c.tripForm.patchValue({
        name: 'Tur',
        fromDate: moment('2026-03-01'), fromTime: moment('1970-01-01 12:00', 'YYYY-MM-DD HH:mm'),
        toDate: moment('2026-03-01'), toTime: moment('1970-01-01 09:00', 'YYYY-MM-DD HH:mm'),
      });
      expect(c.tripForm.hasError('endBeforeStart')).toBe(true);
    });
  });

  describe('edit', () => {
    const trip: Trip = {
      $key: 't1', name: 'Eksisterende tur', start: moment('2026-03-01 09:00', 'YYYY-MM-DD HH:mm'),
      end: moment('2026-03-01 12:00', 'YYYY-MM-DD HH:mm'), drivers: ['d1'], vehicles: ['v1'],
    };

    it('pre-fills the form from the existing trip', () => {
      const fixture = create('edit', {trip});
      const val = fixture.componentInstance.tripForm.value;
      expect(val.name).toBe('Eksisterende tur');
      expect(val.drivers).toEqual(['d1']);
    });

    it('warns (without blocking submission) when a driver already has an overlapping trip', async () => {
      const conflicting: Trip = {
        $key: 't2', name: 'Anden tur', start: moment('2026-03-01 10:00', 'YYYY-MM-DD HH:mm'),
        end: moment('2026-03-01 11:00', 'YYYY-MM-DD HH:mm'), drivers: ['d1'], vehicles: [],
      };
      dataStore.getTrips.mockReturnValue(of([trip, conflicting]));
      const fixture = create('edit', {trip});
      const c = fixture.componentInstance;

      let messages: string[] = [];
      c.driverWarningMessages$.subscribe(m => messages = m);
      await fixture.whenStable();

      expect(messages).toEqual(['Kim er allerede tildelt: \'Anden tur\' 10:00–11:00.']);
      // Still allowed — this never becomes a form validation error.
      expect(c.tripForm.valid).toBe(true);
    });
  });

  describe('delete', () => {
    const trip: Trip = {
      $key: 't1', name: 'Tur', start: moment('2026-03-01 09:00', 'YYYY-MM-DD HH:mm'), end: null, drivers: [], vehicles: [],
    };

    it('emits a remove output when the confirm dialog is accepted', () => {
      confirmed = true;
      const fixture = create('edit', {trip});
      const c = fixture.componentInstance;
      const removed: Trip[] = [];
      c.remove.subscribe(t => removed.push(t));
      c.deleteTrip();
      expect(removed).toEqual([trip]);
    });

    it('does not emit when the confirm dialog is declined', () => {
      confirmed = false;
      const fixture = create('edit', {trip});
      const c = fixture.componentInstance;
      const removed: Trip[] = [];
      c.remove.subscribe(t => removed.push(t));
      c.deleteTrip();
      expect(removed).toEqual([]);
    });
  });
});
