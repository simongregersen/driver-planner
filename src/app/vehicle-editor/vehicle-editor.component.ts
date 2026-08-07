import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import moment from 'moment';
import {Vehicle} from '../vehicle';
import {DateUtility} from '../date-utility';

@Component({
  standalone: true,
  selector: 'app-vehicle-editor',
  templateUrl: './vehicle-editor.component.html',
  styleUrls: ['./vehicle-editor.component.css'],
  imports: [
    ReactiveFormsModule,
    MatButtonModule, MatDatepickerModule, MatDialogModule, MatFormFieldModule, MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleEditorComponent {
  save!: (vehicle: Vehicle, updates: any) => void;
  vehicle!: Vehicle;

  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  readonly dialogRef = inject(MatDialogRef<VehicleEditorComponent>);
  readonly minDate = moment('1900-01-01', 'YYYY-MM-DD');

  vehicleForm: FormGroup = this.fb.group({
    displayName: ['', Validators.required],
    brand: '',
    regNo: '',
    latestInspection: null
  });

  update() {
    this.vehicleForm.patchValue({
      displayName: this.vehicle.displayName,
      brand: this.vehicle.brand,
      regNo: this.vehicle.regNo,
      latestInspection: (this.vehicle.latestInspection) ? this.dateUtility.getDate(moment(this.vehicle.latestInspection)) : null
    });
  }

  onSubmit() {
    const val = this.vehicleForm.value;

    this.save(this.vehicle, {
      displayName: val.displayName || '',
      brand: val.brand || '',
      regNo: val.regNo || '',
      latestInspection: this.dateUtility.toMoment(val.latestInspection)
    });
  }

  public edit(vehicle: Vehicle, save: (vehicle: Vehicle, updates: any) => void) {
    this.save = save;
    this.vehicle = vehicle;

    this.update();
  }
}
