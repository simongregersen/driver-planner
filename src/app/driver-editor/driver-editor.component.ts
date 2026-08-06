import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {NgbActiveModal, NgbInputDatepicker} from '@ng-bootstrap/ng-bootstrap';
import {Driver} from '../driver';
import {NgbUtility} from '../ngb-date-utility';

@Component({
  standalone: true,
  selector: 'app-driver-editor',
  templateUrl: './driver-editor.component.html',
  styleUrls: ['./driver-editor.component.css'],
  imports: [ReactiveFormsModule, NgbInputDatepicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverEditorComponent {
  save!: (driver: Driver, updates: any) => void;
  driver!: Driver;

  private readonly fb = inject(FormBuilder);
  private readonly ngbUtility = inject(NgbUtility);
  readonly modal = inject(NgbActiveModal);

  driverForm: FormGroup = this.fb.group({
    displayName: ['', Validators.required],
    name: ['', Validators.required],
    birthday: null
  });

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
