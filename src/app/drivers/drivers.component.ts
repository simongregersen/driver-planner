import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatTooltipModule} from '@angular/material/tooltip';
import moment from 'moment';
import {DataStore} from '../data.service';
import {Driver} from '../driver';
import {AppUser} from '../user';
import {Observable} from 'rxjs';
import {DateUtility} from '../date-utility';
import {DriverEditorComponent} from '../driver-editor/driver-editor.component';
import {DriverLoginCreatorComponent} from '../driver-login-creator/driver-login-creator.component';
import {DIALOG_CONFIG, SMALL_DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-drivers',
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.css'],
  imports: [
    ReactiveFormsModule, AsyncPipe, DatePipe,
    MatButtonModule, MatCheckboxModule, MatDatepickerModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatMenuModule, MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriversComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);

  drivers!: Observable<Driver[]>;
  users$!: Observable<Record<string, AppUser>>;
  readonly minDate = moment('1900-01-01', 'YYYY-MM-DD');

  driverForm: FormGroup = this.fb.group({
    displayName: ['', Validators.required],
    name: ['', Validators.required],
    birthday: null
  });

  ngOnInit() {
    this.drivers = this.dataStore.getAllDrivers();
    this.users$ = this.dataStore.getAllUsers();
  }

  isDriverAdmin(driver: Driver, users: Record<string, AppUser>): boolean {
    return !!driver.uid && users[driver.uid]?.role === 'admin';
  }

  create() {
    const val = this.driverForm.value;
    this.dataStore.addDriver(val.displayName, val.name, this.dateUtility.toMoment(val.birthday));
    this.driverForm.reset();
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
