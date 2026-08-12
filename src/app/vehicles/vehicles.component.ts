import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Utility} from '../utility';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {DataStore} from '../data.service';
import {VehicleFormComponent} from '../vehicle-form/vehicle-form.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-vehicles',
  templateUrl: './vehicles.component.html',
  styleUrls: ['./vehicles.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatIconModule, MatTooltipModule,
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
    this.dialog.open(VehicleFormComponent, DIALOG_CONFIG).componentInstance.mode = 'create';
  }

  removeVehicle(vehicle: Vehicle) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: `Er du sikker på, at du vil slette køretøjet\n'${vehicle.displayName}'?`,
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) this.dataStore.deleteVehicle(vehicle);
    });
  }

  edit(vehicle: Vehicle) {
    const instance = this.dialog.open(VehicleFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.vehicle = vehicle;
  }

}
