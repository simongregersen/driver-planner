import {ChangeDetectionStrategy, Component, inject, output} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import moment from 'moment';
import {NewVehicle} from '../vehicle';
import {DateUtility} from '../date-utility';

@Component({
  standalone: true,
  selector: 'app-vehicle-creator',
  templateUrl: './vehicle-creator.component.html',
  styleUrls: ['./vehicle-creator.component.css'],
  imports: [
    ReactiveFormsModule,
    MatButtonModule, MatDatepickerModule, MatDialogModule, MatFormFieldModule, MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleCreatorComponent {
  create = output<NewVehicle>();

  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  readonly dialogRef = inject(MatDialogRef<VehicleCreatorComponent>);
  readonly minDate = moment('1900-01-01', 'YYYY-MM-DD');

  vehicleForm: FormGroup = this.fb.group({
    displayName: ['', Validators.required],
    brand: '',
    regNo: '',
    latestInspection: null
  });

  onSubmit() {
    const val = this.vehicleForm.value;
    this.create.emit({
      displayName: val.displayName || '',
      brand: val.brand || '',
      regNo: val.regNo || '',
      latestInspection: this.dateUtility.toMoment(val.latestInspection)
    });
  }
}
