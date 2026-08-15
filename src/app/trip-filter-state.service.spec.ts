import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import moment from 'moment';
import {TripFilterStateService} from './trip-filter-state.service';
import {DataStore} from './data.service';
import {Trip} from './trip';

describe('TripFilterStateService', () => {
  let dataStore: {getAllDrivers: ReturnType<typeof vi.fn>; getAllVehicles: ReturnType<typeof vi.fn>};

  function trip(overrides: Partial<Trip>): Trip {
    return {
      $key: 'x', start: moment('2026-01-01 09:00', 'YYYY-MM-DD HH:mm'), end: moment('2026-01-01 10:00', 'YYYY-MM-DD HH:mm'),
      name: 'Trip', drivers: [], vehicles: [], ...overrides,
    };
  }

  beforeEach(() => {
    dataStore = {
      getAllDrivers: vi.fn(() => of([{$key: 'd1', displayName: 'Kim'}, {$key: 'd2', displayName: 'Jan'}])),
      getAllVehicles: vi.fn(() => of([{$key: 'v1', displayName: 'Bus 1'}, {$key: 'v2', displayName: 'Bus 2'}])),
    };
    TestBed.configureTestingModule({
      providers: [TripFilterStateService, {provide: DataStore, useValue: dataStore}],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('maps drivers/vehicles to select options', () => {
    const service = TestBed.inject(TripFilterStateService);
    expect(service.driverOptions()).toEqual([{id: 'd1', name: 'Kim'}, {id: 'd2', name: 'Jan'}]);
    expect(service.vehicleOptions()).toEqual([{id: 'v1', name: 'Bus 1'}, {id: 'v2', name: 'Bus 2'}]);
  });

  it('joins the display names of the currently selected drivers/vehicles', () => {
    const service = TestBed.inject(TripFilterStateService);
    service.selectedDriverKeys.set(['d1', 'd2']);
    service.selectedVehicleKeys.set(['v2']);
    expect(service.selectedDriverNames()).toBe('Kim, Jan');
    expect(service.selectedVehicleNames()).toBe('Bus 2');
  });

  describe('filterTrips', () => {
    it('returns everything when no filters are selected', () => {
      const service = TestBed.inject(TripFilterStateService);
      const trips = [trip({drivers: ['d1']}), trip({vehicles: ['v1']})];
      expect(service.filterTrips(trips)).toEqual(trips);
    });

    it('filters by selected driver', () => {
      const service = TestBed.inject(TripFilterStateService);
      service.selectedDriverKeys.set(['d1']);
      const matching = trip({drivers: ['d1']});
      const other = trip({drivers: ['d2']});
      expect(service.filterTrips([matching, other])).toEqual([matching]);
    });

    it('filters by selected vehicle', () => {
      const service = TestBed.inject(TripFilterStateService);
      service.selectedVehicleKeys.set(['v1']);
      const matching = trip({vehicles: ['v1']});
      const other = trip({vehicles: ['v2']});
      expect(service.filterTrips([matching, other])).toEqual([matching]);
    });

    it('filters by selected label', () => {
      const service = TestBed.inject(TripFilterStateService);
      service.selectedLabelKeys.set(['VIP']);
      const matching = trip({labels: ['VIP']});
      const other = trip({labels: ['Standard']});
      expect(service.filterTrips([matching, other])).toEqual([matching]);
    });

    it('combines driver/vehicle/label filters with AND', () => {
      const service = TestBed.inject(TripFilterStateService);
      service.selectedDriverKeys.set(['d1']);
      service.selectedVehicleKeys.set(['v1']);
      const matchesBoth = trip({drivers: ['d1'], vehicles: ['v1']});
      const matchesOnlyDriver = trip({drivers: ['d1'], vehicles: ['v2']});
      expect(service.filterTrips([matchesBoth, matchesOnlyDriver])).toEqual([matchesBoth]);
    });

    it('returns an empty array for a null trip list', () => {
      const service = TestBed.inject(TripFilterStateService);
      expect(service.filterTrips(null)).toEqual([]);
    });
  });

  describe('labelOptions', () => {
    it('dedups and sorts labels across all trips', () => {
      const service = TestBed.inject(TripFilterStateService);
      const trips = [trip({labels: ['B', 'A']}), trip({labels: ['A']}), trip({labels: []})];
      expect(service.labelOptions(trips)).toEqual([{id: 'A', name: 'A'}, {id: 'B', name: 'B'}]);
    });
  });

  describe('tripWarnings', () => {
    it('flags two overlapping trips sharing a driver', () => {
      const service = TestBed.inject(TripFilterStateService);
      const a = trip({$key: 'a', start: moment('2026-01-01 09:00', 'YYYY-MM-DD HH:mm'), end: moment('2026-01-01 11:00', 'YYYY-MM-DD HH:mm'), drivers: ['d1']});
      const b = trip({$key: 'b', start: moment('2026-01-01 10:00', 'YYYY-MM-DD HH:mm'), end: moment('2026-01-01 12:00', 'YYYY-MM-DD HH:mm'), drivers: ['d1']});
      const warnings = service.tripWarnings([a, b]);
      expect(warnings.get('a')!.driverConflicts.get('d1')).toEqual([b]);
    });
  });

  describe('isFiltering / applyFilterChange', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('sets isFiltering immediately, then applies the change and clears it on the next macrotask', () => {
      const service = TestBed.inject(TripFilterStateService);
      service.setSelectedDriverKeys(['d1']);
      expect(service.isFiltering()).toBe(true);
      expect(service.selectedDriverKeys()).toEqual([]); // not yet applied

      vi.runAllTimers();

      expect(service.isFiltering()).toBe(false);
      expect(service.selectedDriverKeys()).toEqual(['d1']);
    });

    it('setShowLabels defers the same way', () => {
      const service = TestBed.inject(TripFilterStateService);
      service.setShowLabels(false);
      expect(service.showLabels()).toBe(true); // unchanged yet
      vi.runAllTimers();
      expect(service.showLabels()).toBe(false);
    });
  });
});
