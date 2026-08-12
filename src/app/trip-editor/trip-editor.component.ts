import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {AsyncPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatTimepickerModule} from '@angular/material/timepicker';
import moment from 'moment';
import {SelectOption} from '../select-option';
import {DataStore} from '../data.service';
import {Utility} from '../utility';
import {Trip} from '../trip';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {DateUtility} from '../date-utility';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';
import {BreakpointService} from '../breakpoint.service';

@Component({
  standalone: true,
  selector: 'app-trip-editor',
  templateUrl: './trip-editor.component.html',
  styleUrls: ['./trip-editor.component.css'],
  imports: [
    ReactiveFormsModule, AsyncPipe,
    MatButtonModule, MatDatepickerModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatTimepickerModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripEditorComponent implements OnInit {
  showDate = true;
  save!: (trip: Trip, updates: any) => void;
  remove?: (trip: Trip) => void;
  trip!: Trip;
  availableDrivers$!: Observable<SelectOption[]>;
  availableVehicles$!: Observable<SelectOption[]>;

  private readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<TripEditorComponent>);
  readonly breakpoints = inject(BreakpointService);
  readonly minDate = this.dateUtility.minDate(5);

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
    const fromDate = this.dateUtility.getDate(start);
    const fromTime = this.dateUtility.getTime(start);
    const toDate = (end) ? this.dateUtility.getDate(end) : null;
    const toTime = (end) ? this.dateUtility.getTime(end) : null;

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
    const start = this.dateUtility.toMoment(val.fromDate || moment('1970-01-01', 'YYYY-MM-DD'), val.fromTime)!;
    const end = (val.toDate || val.toTime) ? this.dateUtility.toMoment(val.toDate || this.dateUtility.getDate(start), val.toTime) : null;

    this.save(this.trip, {
      start: start,
      end: (Utility.sameDate(start, end) && !val.toTime) ? null : end,
      name: val.name || '',
      description: val.description || '',
      drivers: val.drivers || [],
      vehicles: val.vehicles || []
    });
  }

  public edit(trip: Trip, save: (trip: Trip, updates: any) => void, remove?: (trip: Trip) => void) {
    this.save = save;
    this.remove = remove;
    this.trip = trip;

    this.update();
  }

  deleteTrip() {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: `Er du sikker på, at du vil slette turen\n'${this.trip.name}'?`,
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.remove?.(this.trip);
        this.dialogRef.close();
      }
    });
  }
}
