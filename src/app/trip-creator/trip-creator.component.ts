import {ChangeDetectionStrategy, Component, inject, OnInit, output} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {DataStore} from '../data.service';
import {SelectOption} from '../select-option';
import {Utility} from '../utility';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import moment, {Moment} from 'moment';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {DateUtility} from '../date-utility';
import {NewTrip} from '../trip';
import {BreakpointService} from '../breakpoint.service';
import {TimeFieldComponent} from '../time-field/time-field.component';

@Component({
  standalone: true,
  selector: 'app-trip-creator',
  templateUrl: './trip-creator.component.html',
  styleUrls: ['./trip-creator.component.css'],
  imports: [
    ReactiveFormsModule, AsyncPipe,
    MatButtonModule, MatDatepickerModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, TimeFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripCreatorComponent implements OnInit {
  create = output<NewTrip>();
  defaultDate: Moment | null = null;
  showDate = true;
  availableDrivers$!: Observable<SelectOption[]>;
  availableVehicles$!: Observable<SelectOption[]>;
  tripForm!: FormGroup;

  private readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  readonly dialogRef = inject(MatDialogRef<TripCreatorComponent>);
  readonly breakpoints = inject(BreakpointService);
  readonly minDate = this.dateUtility.minDate(5);

  ngOnInit() {
    this.tripForm = this.fb.group({
      name: ['', Validators.required],
      fromDate: (this.showDate) ? [this.defaultDate, Validators.required] : null,
      fromTime: null,
      toDate: this.defaultDate,
      toTime: null,
      drivers: [[]],
      vehicles: [[]],
      description: ''
    });

    this.availableDrivers$ = this.dataStore.getAllDrivers()
      .pipe(map(ds => ds.map(d => ({id: d.$key, name: d.displayName}))));
    this.availableVehicles$ = this.dataStore.getAllVehicles()
      .pipe(map(Utility.filterDeleted), map(vs => vs.map(v => ({id: v.$key, name: v.displayName}))));
  }

  onSubmit(): void {
    const val = this.tripForm.value;
    const start = this.dateUtility.toMoment(val.fromDate || moment('1970-01-01', 'YYYY-MM-DD'), val.fromTime)!;
    const end = (val.toDate || val.toTime) ? this.dateUtility.toMoment(val.toDate || this.dateUtility.getDate(start), val.toTime) : null;

    const trip: NewTrip = {
      start: start,
      end: (Utility.sameDate(start, end) && !val.toTime) ? null : end,
      name: val.name,
      description: val.description,
      drivers: val.drivers,
      vehicles: val.vehicles
    };
    this.create.emit(trip);
    this.tripForm.reset();
  }
}
