import {Injectable, computed, inject, signal} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {DataStore} from './data.service';
import {Driver} from './driver';
import {Vehicle} from './vehicle';
import {SelectOption} from './select-option';
import {AssignmentConflicts, Utility} from './utility';
import {Trip} from './trip';

// Shared by Day Plans and Period Plans — the admin driver/vehicle/label filter chips, the "Vis"
// (notes/labels) view toggles, and the filtering/warning logic derived from them. Provided
// per-component (see each host's own `providers: [...]`), never `providedIn: 'root'`, so each
// page gets its own independent filter state rather than sharing one across pages.
@Injectable()
export class TripFilterStateService {
  private readonly dataStore = inject(DataStore);

  readonly selectedDriverKeys = signal<string[]>([]);
  readonly selectedVehicleKeys = signal<string[]>([]);
  readonly selectedLabelKeys = signal<string[]>([]);
  readonly showOfficeNotes = signal(false);
  readonly showDriverNotes = signal(false);
  readonly showLabels = signal(true);

  // Re-filtering/re-rendering the whole trip table on a filter/view-toggle change can take long
  // enough to feel like the app hung, since it happens synchronously within the same change
  // detection pass as the click. Deferring the actual update to the next macrotask (see
  // applyFilterChange) lets the browser paint isFiltering's disabled/spinner state first.
  readonly isFiltering = signal(false);

  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});
  private readonly vehicleList = toSignal(this.dataStore.getAllVehicles(), {initialValue: [] as Vehicle[]});
  readonly driverOptions = computed(() => this.driverList().map(d => ({id: d.$key, name: d.displayName})));
  readonly vehicleOptions = computed(() => this.vehicleList().map(v => ({id: v.$key, name: v.displayName})));
  readonly selectedDriverNames = computed(() =>
    this.driverOptions().filter(o => this.selectedDriverKeys().includes(o.id)).map(o => o.name).join(', ')
  );
  readonly selectedVehicleNames = computed(() =>
    this.vehicleOptions().filter(o => this.selectedVehicleKeys().includes(o.id)).map(o => o.name).join(', ')
  );

  // Marks isFiltering true immediately (so the disabled/spinner state can paint), then defers
  // the actual signal update — the thing that triggers the expensive re-filter/re-render — to
  // the next macrotask, rather than running it synchronously within the same click handler.
  private applyFilterChange(update: () => void): void {
    this.isFiltering.set(true);
    setTimeout(() => {
      update();
      this.isFiltering.set(false);
    });
  }

  setSelectedDriverKeys(keys: string[]): void {
    this.applyFilterChange(() => this.selectedDriverKeys.set(keys));
  }

  setSelectedVehicleKeys(keys: string[]): void {
    this.applyFilterChange(() => this.selectedVehicleKeys.set(keys));
  }

  setSelectedLabelKeys(keys: string[]): void {
    this.applyFilterChange(() => this.selectedLabelKeys.set(keys));
  }

  setShowDriverNotes(value: boolean): void {
    this.applyFilterChange(() => this.showDriverNotes.set(value));
  }

  setShowOfficeNotes(value: boolean): void {
    this.applyFilterChange(() => this.showOfficeNotes.set(value));
  }

  setShowLabels(value: boolean): void {
    this.applyFilterChange(() => this.showLabels.set(value));
  }

  filterTrips(trips: Trip[] | null): Trip[] {
    if (!trips) return [];
    const driverKeys = this.selectedDriverKeys();
    const vehicleKeys = this.selectedVehicleKeys();
    const labelKeys = this.selectedLabelKeys();
    return trips.filter(t =>
      (driverKeys.length === 0 || (t.drivers ?? []).some(k => driverKeys.includes(k))) &&
      (vehicleKeys.length === 0 || (t.vehicles ?? []).some(k => vehicleKeys.includes(k))) &&
      (labelKeys.length === 0 || (t.labels ?? []).some(k => labelKeys.includes(k)))
    );
  }

  // Computed off the caller's own full, pre-filter trip list — NOT filterTrips's output — so a
  // conflict never depends on whatever driver/vehicle/label chips happen to be selected.
  tripWarnings(trips: Trip[] | null): Map<string, AssignmentConflicts> {
    return Utility.computeAssignmentWarnings(trips ?? []);
  }

  // Labels are freeform strings on each trip, not a fixed entity list like drivers/vehicles —
  // the filter's own options are just whichever distinct labels actually appear on the trips
  // currently in view, derived fresh each time rather than stored anywhere.
  labelOptions(trips: Trip[] | null): SelectOption[] {
    if (!trips) return [];
    const labels = new Set<string>();
    trips.forEach(t => (t.labels ?? []).forEach(l => labels.add(l)));
    return Array.from(labels)
      .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}))
      .map(l => ({id: l, name: l}));
  }
}
