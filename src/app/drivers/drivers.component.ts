import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import {DataStore} from '../data.service';
import {Driver, NewDriver} from '../driver';
import {AppUser} from '../user';
import {Observable} from 'rxjs';
import {DriverEditorComponent} from '../driver-editor/driver-editor.component';
import {DriverCreatorComponent} from '../driver-creator/driver-creator.component';
import {DriverLoginCreatorComponent} from '../driver-login-creator/driver-login-creator.component';
import {DIALOG_CONFIG, SMALL_DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-drivers',
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatCheckboxModule, MatIconModule, MatMenuModule, MatTooltipModule,
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
    const dialogRef = this.dialog.open(DriverCreatorComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.create.subscribe((d: NewDriver) => this.dataStore.addDriver(d.displayName, d.name, d.birthday));
  }

  removeDriver(driver: Driver) {
    this.dataStore.deleteDriver(driver);
  }

  setDriverAdmin(driver: Driver, isAdmin: boolean) {
    if (!driver.uid) return;
    this.dataStore.setUserAdmin(driver.uid, isAdmin);
  }

  edit(driver: Driver) {
    const dialogRef = this.dialog.open(DriverEditorComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.edit(driver, (d: Driver, u: any) => this.dataStore.updateDriver(d, u));
  }

  createLogin(driver: Driver) {
    const dialogRef = this.dialog.open(DriverLoginCreatorComponent, SMALL_DIALOG_CONFIG);
    dialogRef.componentInstance.driver = driver;
  }

}
