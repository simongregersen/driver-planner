import {ChangeDetectionStrategy, Component, computed, input, output} from '@angular/core';
import {CdkDragDrop, DragDropModule} from '@angular/cdk/drag-drop';

// Drag-and-drop pairing of drivers to vehicles on a trip — dragging a driver chip into a
// vehicle's zone assigns them to it; dragging it into the "Ikke tildelt" zone (or any other
// vehicle's zone) reassigns/clears it. A controlled component, same shape as ChipFilterComponent:
// flat inputs in, a matching `...Change` output out, no state of its own beyond what's derived.
//
// Every zone's contents are computed from `assignments`/`driverIds`/`vehicleIds` rather than
// stored — that's what makes this self-healing: if a vehicle is deselected from the trip form's
// vehicles control, its zone simply stops being rendered (see the `@for` over vehicleIds() in the
// template) and any driver who was "in" it falls straight out into unassignedDriverIds below, with
// no explicit prune step needed here. TripFormComponent.onSubmit still re-filters the emitted
// assignments defensively against the submitted drivers/vehicles arrays, so this component's own
// bookkeeping being slightly stale between drags is never load-bearing for data integrity.
@Component({
  standalone: true,
  selector: 'app-driver-vehicle-assignment',
  templateUrl: './driver-vehicle-assignment.component.html',
  styleUrls: ['./driver-vehicle-assignment.component.css'],
  imports: [DragDropModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverVehicleAssignmentComponent {
  driverIds = input<string[]>([]);
  vehicleIds = input<string[]>([]);
  driverNames = input<Map<string, string>>(new Map());
  vehicleNames = input<Map<string, string>>(new Map());
  /** driverKey -> vehicleKey. A driver with no entry is unassigned. */
  assignments = input<Record<string, string>>({});
  assignmentsChange = output<Record<string, string>>();

  // A driver's own assignment only counts while the vehicle it points at is still actually
  // selected on the trip — otherwise a deselected vehicle's last driver would vanish from every
  // zone instead of falling back to "Ikke tildelt".
  readonly unassignedDriverIds = computed(() => {
    const vehicleIds = this.vehicleIds();
    const assignments = this.assignments();
    return this.driverIds().filter(id => !vehicleIds.includes(assignments[id]));
  });

  driversFor(vehicleKey: string): string[] {
    const assignments = this.assignments();
    return this.driverIds().filter(id => assignments[id] === vehicleKey);
  }

  driverName(driverKey: string): string {
    return this.driverNames().get(driverKey) ?? driverKey;
  }

  vehicleName(vehicleKey: string): string {
    return this.vehicleNames().get(vehicleKey) ?? vehicleKey;
  }

  // `targetVehicleKey` is null for the "Ikke tildelt" zone — dropping there clears the
  // assignment rather than pointing it at a vehicle. Zone membership only, not per-zone order:
  // nothing here reads position, so there's no need to moveItemInArray/transferArrayItem — just
  // record which zone the dragged driver landed in and let the computed zones above re-derive
  // everyone's rendering from that.
  onDrop(event: CdkDragDrop<string[], string[], string>, targetVehicleKey: string | null): void {
    const driverKey = event.item.data;
    const current = this.assignments();
    const alreadyThere = targetVehicleKey ? current[driverKey] === targetVehicleKey : current[driverKey] === undefined;
    if (alreadyThere) return;
    const next = {...current};
    if (targetVehicleKey) {
      next[driverKey] = targetVehicleKey;
    } else {
      delete next[driverKey];
    }
    this.assignmentsChange.emit(next);
  }
}
