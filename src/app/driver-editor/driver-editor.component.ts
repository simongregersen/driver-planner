import {Component} from '@angular/core';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {Driver} from '../driver';
import {NgbUtility} from '../ngb-date-utility';
import {NgbActiveModal} from '@ng-bootstrap/ng-bootstrap';

@Component({
  standalone: false,
  selector: 'app-driver-editor',
  templateUrl: './driver-editor.component.html',
  styleUrls: ['./driver-editor.component.css']
})
export class DriverEditorComponent {
  save!: (driver: Driver, updates: any) => void;
  driver!: Driver;
  driverForm: FormGroup;

  constructor(private fb: FormBuilder, private ngbUtility: NgbUtility, public modal: NgbActiveModal) {
    this.driverForm = this.fb.group({
      displayName: ['', Validators.required],
      name: ['', Validators.required],
      birthday: null
    });
  }

  update() {
    this.driverForm.patchValue({
      displayName: this.driver.displayName,
      name: this.driver.name,
      birthday: (this.driver.birthday) ? this.ngbUtility.getDate(this.driver.birthday) : null
    });
  }

  onSubmit() {
    const val = this.driverForm.value;

    this.save(this.driver, {
      displayName: val.displayName || '',
      name: val.name || '',
      birthday: this.ngbUtility.toMoment(val.birthday)
    });
  }

  public edit(driver: Driver, save: (driver: Driver, updates: any) => void) {
    this.save = save;
    this.driver = driver;

    this.update();
  }
}
