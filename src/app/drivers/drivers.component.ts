import {Component, OnInit} from '@angular/core';
import {DataStore} from '../data.service';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {Driver} from '../driver';
import {Observable} from 'rxjs';
import {NgbUtility} from '../ngb-date-utility';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {DriverEditorComponent} from '../driver-editor/driver-editor.component';
import {DriverLoginCreatorComponent} from '../driver-login-creator/driver-login-creator.component';

@Component({
  standalone: false,
  selector: 'app-drivers',
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.css']
})
export class DriversComponent implements OnInit {
  driverForm: FormGroup;
  drivers!: Observable<Driver[]>;

  constructor(public dataStore: DataStore, private fb: FormBuilder, private ngbUtility: NgbUtility, private modalService: NgbModal) {
    this.driverForm = this.fb.group({
      displayName: ['', Validators.required],
      name: ['', Validators.required],
      birthday: null
    });
  }

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
