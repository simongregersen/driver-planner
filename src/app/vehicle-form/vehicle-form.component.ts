import {ChangeDetectionStrategy, Component, OnInit, inject} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import moment, {Moment} from 'moment';
import {NewVehicle, Vehicle} from '../vehicle';
import {DateUtility} from '../date-utility';
import {DateFieldComponent} from '../date-field/date-field.component';
import {DataStore} from '../data.service';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';

export type VehicleFormMode = 'create' | 'edit';

// Create and edit are the same form (kaldenavn/mærke/reg. nr./sidst synet) with only the title,
// submit label, and initial values differing — replaces the previously separate
// VehicleCreatorComponent/VehicleEditorComponent, following the same pattern as
// TripFormComponent/DriverFormComponent.
//
// Saves directly to DataStore itself rather than emitting an output for the caller to persist —
// unlike TripFormComponent, there's only ever one call site (VehiclesComponent) and one
// persistence path, so there's no context only a caller could supply (compare Trip's
// Templates-vs-regular-day split, which genuinely needs that indirection).
//
// Opened via MatDialog.open() with no data binding — `mode` (and `vehicle` below) are set
// directly on componentInstance by the caller straight after open(); that assignment happens
// before Angular runs ngOnInit (dialog creation defers it), so ngOnInit sees the final values.
@Component({
  standalone: true,
  selector: 'app-vehicle-form',
  templateUrl: './vehicle-form.component.html',
  styleUrls: ['./vehicle-form.component.css'],
  imports: [
    ReactiveFormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    DateFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleFormComponent implements OnInit {
  mode: VehicleFormMode = 'create';
  /** Required when mode is 'edit'. */
  vehicle!: Vehicle;

  private readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<VehicleFormComponent>);
  readonly minDate = moment('1900-01-01', 'YYYY-MM-DD');

  vehicleForm!: FormGroup;

  ngOnInit() {
    const isEdit = this.mode === 'edit';
    this.vehicleForm = this.fb.group({
      displayName: [isEdit ? this.vehicle.displayName : '', Validators.required],
      brand: isEdit ? this.vehicle.brand : '',
      regNo: isEdit ? this.vehicle.regNo : '',
      latestInspection: (isEdit && this.vehicle.latestInspection)
        ? this.dateUtility.getDate(moment(this.vehicle.latestInspection)) : null
    });
  }

  setLatestInspection(value: Moment | null): void {
    this.vehicleForm.controls['latestInspection'].setValue(value);
  }

  onSubmit() {
    const val = this.vehicleForm.value;
    const vehicle: NewVehicle = {
      displayName: val.displayName || '',
      brand: val.brand || '',
      regNo: val.regNo || '',
      latestInspection: this.dateUtility.toMoment(val.latestInspection)
    };
    if (this.mode === 'edit') {
      this.dataStore.updateVehicle(this.vehicle, vehicle);
    } else {
      this.dataStore.addVehicle(vehicle.displayName, vehicle.brand, vehicle.regNo, vehicle.latestInspection);
    }
  }

  deleteVehicle(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: `Er du sikker på, at du vil slette køretøjet\n'${this.vehicle.displayName}'?`,
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.dataStore.deleteVehicle(this.vehicle);
        this.dialogRef.close();
      }
    });
  }
}
