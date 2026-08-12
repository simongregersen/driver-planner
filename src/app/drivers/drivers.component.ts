import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {DataStore} from '../data.service';
import {Driver} from '../driver';
import {AppUser} from '../user';
import {Observable} from 'rxjs';
import {DriverFormComponent} from '../driver-form/driver-form.component';
import {DriverLoginCreatorComponent} from '../driver-login-creator/driver-login-creator.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG, SMALL_DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-drivers',
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatCheckboxModule, MatIconModule, MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriversComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);

  drivers!: Observable<Driver[]>;
  users$!: Observable<Record<string, AppUser>>;

  ngOnInit() {
    this.drivers = this.dataStore.getAllDrivers();
    this.users$ = this.dataStore.getAllUsers();
  }

  isDriverAdmin(driver: Driver, users: Record<string, AppUser>): boolean {
    return !!driver.uid && users[driver.uid]?.role === 'admin';
  }

  create() {
    this.dialog.open(DriverFormComponent, DIALOG_CONFIG).componentInstance.mode = 'create';
  }

  removeDriver(driver: Driver) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: `Er du sikker på, at du vil slette chaufføren\n'${driver.displayName}'?`,
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) this.dataStore.deleteDriver(driver);
    });
  }

  setDriverAdmin(driver: Driver, isAdmin: boolean) {
    if (!driver.uid) return;
    this.dataStore.setUserAdmin(driver.uid, isAdmin);
  }

  edit(driver: Driver) {
    const instance = this.dialog.open(DriverFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.driver = driver;
  }

  createLogin(driver: Driver) {
    const dialogRef = this.dialog.open(DriverLoginCreatorComponent, SMALL_DIALOG_CONFIG);
    dialogRef.componentInstance.driver = driver;
  }

}
