import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {NgbInputDatepicker, NgbModal, NgbTooltip} from '@ng-bootstrap/ng-bootstrap';
import {ConfirmationPopoverModule} from 'angular-confirmation-popover';
import {DataStore} from '../data.service';
import {Driver} from '../driver';
import {Observable} from 'rxjs';
import {NgbUtility} from '../ngb-date-utility';
import {DriverEditorComponent} from '../driver-editor/driver-editor.component';
import {DriverLoginCreatorComponent} from '../driver-login-creator/driver-login-creator.component';

@Component({
  standalone: true,
  selector: 'app-drivers',
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.css'],
  imports: [ReactiveFormsModule, AsyncPipe, DatePipe, NgbInputDatepicker, ConfirmationPopoverModule, NgbTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriversComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly ngbUtility = inject(NgbUtility);
  private readonly modalService = inject(NgbModal);

  drivers!: Observable<Driver[]>;

  driverForm: FormGroup = this.fb.group({
    displayName: ['', Validators.required],
    name: ['', Validators.required],
    birthday: null
  });

  ngOnInit() {
    this.drivers = this.dataStore.getAllDrivers()
  }

  create() {
    const val = this.driverForm.value;
    this.dataStore.addDriver(val.displayName, val.name, this.ngbUtility.toMoment(val.birthday));
    this.driverForm.reset();
  }

  removeDriver(driver: Driver) {
    this.dataStore.deleteDriver(driver);
  }

  edit(driver: Driver) {
    const modalRef = this.modalService.open(DriverEditorComponent, {size: 'lg'});
    modalRef.componentInstance.edit(driver, (d: Driver, u: any) => this.dataStore.updateDriver(d, u));
  }

  createLogin(driver: Driver) {
    const modalRef = this.modalService.open(DriverLoginCreatorComponent);
    modalRef.componentInstance.driver = driver;
  }

}
