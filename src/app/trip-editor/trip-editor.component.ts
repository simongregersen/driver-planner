import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {AsyncPipe} from '@angular/common';
import {NgbActiveModal, NgbCalendar, NgbInputDatepicker, NgbTimepicker} from '@ng-bootstrap/ng-bootstrap';
import {NgSelectModule} from '@ng-select/ng-select';
import moment from 'moment';
import {SelectOption} from '../select-option';
import {DataStore} from '../data.service';
import {Utility} from '../utility';
import {Trip} from '../trip';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {NgbUtility} from '../ngb-date-utility';

@Component({
  standalone: true,
  selector: 'app-trip-editor',
  templateUrl: './trip-editor.component.html',
  styleUrls: ['./trip-editor.component.css'],
  imports: [ReactiveFormsModule, AsyncPipe, NgbInputDatepicker, NgbTimepicker, NgSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripEditorComponent implements OnInit {
  showDate = true;
  save!: (trip: Trip, updates: any) => void;
  trip!: Trip;
  availableDrivers$!: Observable<SelectOption[]>;
  availableVehicles$!: Observable<SelectOption[]>;

  private readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly ngbUtility = inject(NgbUtility);
  private readonly calendar = inject(NgbCalendar);
  readonly modal = inject(NgbActiveModal);
  readonly minDate = this.ngbUtility.minDate(5);

  tripForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    fromDate: (this.showDate) ? [null, Validators.required] : null,
    fromTime: null,
    toDate: null,
    toTime: null,
    drivers: [[]],
    vehicles: [[]],
    description: ''
  });

  ngOnInit() {
    this.availableDrivers$ = this.dataStore.getAllDrivers()
      .pipe(map(Utility.filterDeleted), map(ds => ds.map(d => ({id: d.$key, name: d.displayName}))));
    this.availableVehicles$ = this.dataStore.getAllVehicles()
      .pipe(map(Utility.filterDeleted), map(vs => vs.map(v => ({id: v.$key, name: v.displayName}))));
  }

  update() {
    const start = moment(this.trip.start);
    const end = (this.trip.end) ? moment(this.trip.end) : null;
    const fromDate = this.ngbUtility.getDate(start);
    const fromTime = this.ngbUtility.getTime(start);
    const toDate = (end) ? this.ngbUtility.getDate(end) : null;
    const toTime = (end) ? this.ngbUtility.getTime(end) : null;

    this.tripForm.patchValue({
      ...this.trip,
      fromDate: fromDate,
      fromTime: fromTime,
      toDate: toDate,
      toTime: toTime
    });
  }

  onSubmit() {
    const val = this.tripForm.value;
    const start = this.ngbUtility.toMoment(val.fromDate || {year: 1970, month: 1, day: 1}, val.fromTime)!;
    const end = (val.toDate || val.toTime) ? this.ngbUtility.toMoment(val.toDate || this.ngbUtility.getDate(start), val.toTime) : null;

    this.save(this.trip, {
      start: start,
      end: (Utility.sameDate(start, end) && !val.toTime) ? null : end,
      name: val.name || '',
      description: val.description || '',
      drivers: val.drivers || [],
      vehicles: val.vehicles || []
    });
  }

  public edit(trip: Trip, save: (trip: Trip, updates: any) => void) {
    this.save = save;
    this.trip = trip;

    this.update();
  }
}
