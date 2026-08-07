import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import moment from 'moment';
import {Utility} from '../utility';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {DateUtility} from '../date-utility';
import {DataStore} from '../data.service';
import {VehicleEditorComponent} from '../vehicle-editor/vehicle-editor.component';
import {DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-vehicles',
  templateUrl: './vehicles.component.html',
  styleUrls: ['./vehicles.component.css'],
  imports: [
    ReactiveFormsModule, AsyncPipe, DatePipe,
    MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatMenuModule, MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehiclesComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);

  vehicles!: Observable<Vehicle[]>;
  readonly minDate = moment('1900-01-01', 'YYYY-MM-DD');

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
    this.dataStore.addVehicle(val.displayName, val.brand, val.regNo, this.dateUtility.toMoment(val.latestInspection));
    this.vehicleForm.reset();
  }

  removeVehicle(vehicle: Vehicle) {
    this.dataStore.deleteVehicle(vehicle);
  }

  edit(vehicle: Vehicle) {
    const dialogRef = this.dialog.open(VehicleEditorComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.edit(vehicle, (v: Vehicle, u: any) => this.dataStore.updateVehicle(v, u));
  }

}
