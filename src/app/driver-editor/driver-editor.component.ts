import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import moment from 'moment';
import {Driver} from '../driver';
import {DateUtility} from '../date-utility';

@Component({
  standalone: true,
  selector: 'app-driver-editor',
  templateUrl: './driver-editor.component.html',
  styleUrls: ['./driver-editor.component.css'],
  imports: [
    ReactiveFormsModule,
    MatButtonModule, MatDatepickerModule, MatDialogModule, MatFormFieldModule, MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverEditorComponent {
  save!: (driver: Driver, updates: any) => void;
  driver!: Driver;

  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  readonly dialogRef = inject(MatDialogRef<DriverEditorComponent>);
  readonly minDate = moment('1900-01-01', 'YYYY-MM-DD');

  driverForm: FormGroup = this.fb.group({
    displayName: ['', Validators.required],
    name: ['', Validators.required],
    birthday: null
  });

  update() {
    this.driverForm.patchValue({
      displayName: this.driver.displayName,
      name: this.driver.name,
      birthday: (this.driver.birthday) ? this.dateUtility.getDate(this.driver.birthday) : null
    });
  }

  onSubmit() {
    const val = this.driverForm.value;

    this.save(this.driver, {
      displayName: val.displayName || '',
      name: val.name || '',
      birthday: this.dateUtility.toMoment(val.birthday)
    });
  }

  public edit(driver: Driver, save: (driver: Driver, updates: any) => void) {
    this.save = save;
    this.driver = driver;

    this.update();
  }
}
