import {ChangeDetectionStrategy, Component, inject, output} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import moment from 'moment';
import {NewDriver} from '../driver';
import {DateUtility} from '../date-utility';

@Component({
  standalone: true,
  selector: 'app-driver-creator',
  templateUrl: './driver-creator.component.html',
  styleUrls: ['./driver-creator.component.css'],
  imports: [
    ReactiveFormsModule,
    MatButtonModule, MatDatepickerModule, MatDialogModule, MatFormFieldModule, MatInputModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverCreatorComponent {
  create = output<NewDriver>();

  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  readonly dialogRef = inject(MatDialogRef<DriverCreatorComponent>);
  readonly minDate = moment('1900-01-01', 'YYYY-MM-DD');

  driverForm: FormGroup = this.fb.group({
    displayName: ['', Validators.required],
    name: ['', Validators.required],
    birthday: null
  });

  onSubmit() {
    const val = this.driverForm.value;
    this.create.emit({
      displayName: val.displayName || '',
      name: val.name || '',
      birthday: this.dateUtility.toMoment(val.birthday)
    });
  }
}
