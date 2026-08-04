import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {DataStore} from '../data.service';
import {SelectOption} from '../select-option';
import {Utility} from '../utility';
import {FormBuilder, FormGroup, Validators} from '@angular/forms';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {NgbUtility} from '../ngb-date-utility';
import {NgbActiveModal, NgbDateStruct} from '@ng-bootstrap/ng-bootstrap';
import {NewTrip} from '../trip';

@Component({
  standalone: false,
  selector: 'app-trip-creator',
  templateUrl: './trip-creator.component.html',
  styleUrls: ['./trip-creator.component.css']
})
export class TripCreatorComponent implements OnInit {
  @Output() create = new EventEmitter<NewTrip>();
  @Input() defaultDate: NgbDateStruct | null = null;
  @Input() showDate = true;
  availableDrivers$!: Observable<SelectOption[]>;
  availableVehicles$!: Observable<SelectOption[]>;
  tripForm!: FormGroup;

  constructor(private dataStore: DataStore, private fb: FormBuilder, private ngbUtility: NgbUtility, public modal: NgbActiveModal) {
  }

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
    const start = this.ngbUtility.toMoment(val.fromDate || {year: 1970, month: 1, day: 1}, val.fromTime)!;
    const end = (val.toDate || val.toTime) ? this.ngbUtility.toMoment(val.toDate || this.ngbUtility.getDate(start), val.toTime) : null;

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
