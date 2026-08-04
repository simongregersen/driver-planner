import {Component, OnInit} from '@angular/core';
import {DataStore} from '../data.service';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {Utility} from '../utility';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {NgbUtility} from '../ngb-date-utility';

@Component({
  standalone: false,
  selector: 'app-vehicles',
  templateUrl: './vehicles.component.html',
  styleUrls: ['./vehicles.component.css']
})
export class VehiclesComponent implements OnInit {
  vehicleForm: FormGroup;
  vehicles!: Observable<Vehicle[]>;

  constructor(public dataStore: DataStore, private fb: FormBuilder, private ngbUtility: NgbUtility) {
    this.vehicleForm = this.fb.group({
      displayName: ['', Validators.required],
      brand: '',
      regNo: '',
      latestInspection: null
    })
  }

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

}
