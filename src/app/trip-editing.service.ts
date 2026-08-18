import {Injectable, inject} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {Moment} from 'moment';
import {DataStore} from './data.service';
import {Driver} from './driver';
import {Vehicle} from './vehicle';
import {NewTrip, Trip} from './trip';
import {TripFormComponent} from './trip-form/trip-form.component';
import {ConfirmDialogComponent, ConfirmDialogData} from './confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG} from './dialog-config';
import {WriteFeedbackService} from './write-feedback.service';

// Shared by Day Plans and Period Plans — the regular (non-template) trip create/edit/remove
// flow through TripFormComponent, persisted via DataStore's plain trip methods (updateTrip/
// addTrip/removeTrip). Provided per-component (see each host's own `providers: [...]`).
// Deliberately doesn't cover TemplatesComponent, which drives the same TripFormComponent dialog
// but persists through a different set of DataStore methods (updateTripFromTemplate/
// addTripToTemplate) — a genuinely different persistence path, not just a different call site.
@Injectable()
export class TripEditingService {
  private readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);
  private readonly writeFeedback = inject(WriteFeedbackService);

  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});
  private readonly vehicleList = toSignal(this.dataStore.getAllVehicles(), {initialValue: [] as Vehicle[]});

  removeTrip(trip: Trip) {
    return this.dataStore.removeTrip(trip);
  }

  // Shared by edit()/create()'s save/remove subscriptions. A rejected write (permission denied,
  // a validation rule) leaves the dialog open with a snackbar instead of silently discarding the
  // edit. A write that simply hasn't been acknowledged yet — the offline case, where the RTDB
  // promise never settles at all — closes the dialog and says so, rather than freezing it
  // forever, which is what the previous plain then/catch did. See WriteFeedbackService.
  private closeOnSave(dialogRef: MatDialogRef<TripFormComponent>, saved: PromiseLike<unknown>): void {
    const instance = dialogRef.componentInstance;
    instance?.saving.set(true);
    this.writeFeedback.run(saved).then(outcome => {
      instance?.saving.set(false);
      if (outcome !== 'failed') dialogRef.close();
    });
  }

  removeDriverFromTrip({trip, driverKey}: {trip: Trip; driverKey: string}) {
    const name = this.driverList().find(d => d.$key === driverKey)?.displayName ?? 'chaufføren';
    // Also prunes the removed driver's own vehicleAssignments entry (if any) in the same update,
    // so removing a driver can never leave a dangling pairing behind.
    const {[driverKey]: _removed, ...vehicleAssignments} = trip.vehicleAssignments ?? {};
    this.confirmRemoval(`Er du sikker på, at du vil fjerne ${name} fra turen?`, () =>
      this.dataStore.updateTrip(trip, {drivers: trip.drivers.filter(k => k !== driverKey), vehicleAssignments}));
  }

  removeVehicleFromTrip({trip, vehicleKey}: {trip: Trip; vehicleKey: string}) {
    const name = this.vehicleList().find(v => v.$key === vehicleKey)?.displayName ?? 'køretøjet';
    // Also prunes any driver(s) paired with the removed vehicle, so removing a vehicle can never
    // leave a dangling pairing behind.
    const vehicleAssignments = Object.fromEntries(Object.entries(trip.vehicleAssignments ?? {}).filter(([, v]) => v !== vehicleKey));
    this.confirmRemoval(`Er du sikker på, at du vil fjerne ${name} fra turen?`, () =>
      this.dataStore.updateTrip(trip, {vehicles: trip.vehicles.filter(k => k !== vehicleKey), vehicleAssignments}));
  }

  // Chip removal happens right next to the row-click-to-edit target, and on a phone screen
  // it's easy to hit by mistake — this catches that before it silently changes the trip.
  private confirmRemoval(message: string, onConfirm: () => PromiseLike<unknown>): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {message, confirmLabel: 'Fjern', danger: true} as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) void this.writeFeedback.run(onConfirm());
    });
  }

  edit(trip: Trip) {
    const dialogRef = this.dialog.open(TripFormComponent, DIALOG_CONFIG);
    const instance = dialogRef.componentInstance;
    instance.mode = 'edit';
    instance.trip = trip;
    instance.save.subscribe((updates: NewTrip) => this.closeOnSave(dialogRef, this.dataStore.updateTrip(trip, updates)));
    instance.remove.subscribe(() => this.closeOnSave(dialogRef, this.removeTrip(trip)));
  }

  create(defaultDate: Moment | null) {
    const dialogRef = this.dialog.open(TripFormComponent, DIALOG_CONFIG);
    const instance = dialogRef.componentInstance;
    instance.mode = 'create';
    instance.defaultDate = defaultDate;
    instance.save.subscribe((t: NewTrip) => this.closeOnSave(dialogRef, this.dataStore.addTrip(t)));
  }
}
