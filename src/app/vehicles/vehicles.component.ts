import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Utility} from '../utility';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {NgbUtility} from '../ngb-date-utility';
import {NgbInputDatepicker, NgbModal, NgbTooltip} from '@ng-bootstrap/ng-bootstrap';
import {ConfirmationPopoverModule} from 'angular-confirmation-popover';
import {DataStore} from '../data.service';
import {VehicleEditorComponent} from '../vehicle-editor/vehicle-editor.component';

@Component({
  standalone: true,
  selector: 'app-vehicles',
  templateUrl: './vehicles.component.html',
  styleUrls: ['./vehicles.component.css'],
  imports: [ReactiveFormsModule, AsyncPipe, DatePipe, NgbInputDatepicker, ConfirmationPopoverModule, NgbTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehiclesComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly ngbUtility = inject(NgbUtility);
  private readonly modalService = inject(NgbModal);

  vehicles!: Observable<Vehicle[]>;

  vehicleForm: FormGroup = this.fb.group({
    displayName: ['', Validators.required],
    brand: '',
    regNo: '',
    latestInspection: null
  });

  ngOnInit() {
    this.vehicles = this.dataStore.getAllVehicles().pipe(map(Utility.filterDeleted));
  }

  create() {
    const val = this.vehicleForm.value;
    this.dataStore.addVehicle(val.displayName, val.brand, val.regNo, this.ngbUtility.toMoment(val.latestInspection));
    this.vehicleForm.reset();
  }

  removeVehicle(vehicle: Vehicle) {
    this.dataStore.deleteVehicle(vehicle);
  }

  edit(vehicle: Vehicle) {
    const modalRef = this.modalService.open(VehicleEditorComponent, {size: 'lg'});
    modalRef.componentInstance.edit(vehicle, (v: Vehicle, u: any) => this.dataStore.updateVehicle(v, u));
  }

}
