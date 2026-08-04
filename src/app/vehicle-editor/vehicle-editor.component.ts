import {Component} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {Vehicle} from '../vehicle';
import {NgbUtility} from '../ngb-date-utility';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';
import moment from 'moment';

@Component({
  standalone: false,
  selector: 'app-vehicle-editor',
  templateUrl: './vehicle-editor.component.html',
  styleUrls: ['./vehicle-editor.component.css']
})
export class VehicleEditorComponent {
  save!: (vehicle: Vehicle, updates: any) => void;
  vehicle!: Vehicle;
  vehicleForm: FormGroup;

  constructor(private fb: FormBuilder, private ngbUtility: NgbUtility, public modal: NgbActiveModal) {
    this.vehicleForm = this.fb.group({
      displayName: ['', Validators.required],
      brand: '',
      regNo: '',
      latestInspection: null
    });
  }

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
