import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {NgbActiveModal, NgbInputDatepicker} from '@ng-bootstrap/ng-bootstrap';
import moment from 'moment';
import {Vehicle} from '../vehicle';
import {NgbUtility} from '../ngb-date-utility';

@Component({
  standalone: true,
  selector: 'app-vehicle-editor',
  templateUrl: './vehicle-editor.component.html',
  styleUrls: ['./vehicle-editor.component.css'],
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehicleEditorComponent {
  save!: (vehicle: Vehicle, updates: any) => void;
  vehicle!: Vehicle;

  private readonly fb = inject(FormBuilder);
  private readonly ngbUtility = inject(NgbUtility);
  readonly modal = inject(NgbActiveModal);

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
      latestInspection: (this.vehicle.latestInspection) ? this.ngbUtility.getDate(moment(this.vehicle.latestInspection)) : null
    });
  }

  onSubmit() {
    const val = this.vehicleForm.value;

    this.save(this.vehicle, {
      displayName: val.displayName || '',
      brand: val.brand || '',
      regNo: val.regNo || '',
      latestInspection: this.ngbUtility.toMoment(val.latestInspection)
    });
  }

  public edit(vehicle: Vehicle, save: (vehicle: Vehicle, updates: any) => void) {
    this.save = save;
    this.vehicle = vehicle;

    this.update();
  }
}
