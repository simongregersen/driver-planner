import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Utility} from '../utility';
import {NewVehicle, Vehicle} from '../vehicle';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {DataStore} from '../data.service';
import {VehicleEditorComponent} from '../vehicle-editor/vehicle-editor.component';
import {VehicleCreatorComponent} from '../vehicle-creator/vehicle-creator.component';
import {DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-vehicles',
  templateUrl: './vehicles.component.html',
  styleUrls: ['./vehicles.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VehiclesComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);

  vehicles!: Observable<Vehicle[]>;

  ngOnInit() {
    this.vehicles = this.dataStore.getAllVehicles().pipe(map(Utility.filterDeleted));
  }

  create() {
    const dialogRef = this.dialog.open(VehicleCreatorComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.create.subscribe((v: NewVehicle) => this.dataStore.addVehicle(v.displayName, v.brand, v.regNo, v.latestInspection));
  }

  removeVehicle(vehicle: Vehicle) {
    this.dataStore.deleteVehicle(vehicle);
  }

  edit(vehicle: Vehicle) {
    const dialogRef = this.dialog.open(VehicleEditorComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.edit(vehicle, (v: Vehicle, u: any) => this.dataStore.updateVehicle(v, u));
  }

}
