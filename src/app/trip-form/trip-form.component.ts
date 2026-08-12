import {ChangeDetectionStrategy, Component, OnInit, inject, output} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {AsyncPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import moment, {Moment} from 'moment';
import {SelectOption} from '../select-option';
import {DataStore} from '../data.service';
import {Utility} from '../utility';
import {NewTrip, Trip} from '../trip';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {DateUtility} from '../date-utility';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';
import {BreakpointService} from '../breakpoint.service';
import {TimeFieldComponent} from '../time-field/time-field.component';

export type TripFormMode = 'create' | 'edit';

// Create and edit are the same form (name/dates/times/drivers/vehicles/description) with only
// the title, submit label, and whether a delete button shows differing — this one component
// replaces what used to be separate TripCreatorComponent/TripEditorComponent.
//
// Opened via MatDialog.open() with no data binding — `mode` (and `trip`/`defaultDate` below) are
// set directly on componentInstance by the caller straight after open(), the same way
// TripCreatorComponent's `defaultDate` always was; that assignment happens before Angular runs
// ngOnInit (dialog creation defers it), so ngOnInit sees the final values.
@Component({
  standalone: true,
  selector: 'app-trip-form',
  templateUrl: './trip-form.component.html',
  styleUrls: ['./trip-form.component.css'],
  imports: [
    ReactiveFormsModule, AsyncPipe,
    MatButtonModule, MatDatepickerModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, TimeFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripFormComponent implements OnInit {
  mode: TripFormMode = 'create';
  showDate = true;
  /** Required when mode is 'edit'. */
  trip!: Trip;
  /** Used when mode is 'create' only. */
  defaultDate: Moment | null = null;

  readonly save = output<NewTrip>();
  /** Emitted when mode is 'edit' and the user confirms deletion. */
  readonly remove = output<Trip>();

  availableDrivers$!: Observable<SelectOption[]>;
  availableVehicles$!: Observable<SelectOption[]>;
  tripForm!: FormGroup;

  private readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<TripFormComponent>);
  readonly breakpoints = inject(BreakpointService);
  readonly minDate = this.dateUtility.minDate(5);

  ngOnInit() {
    const isEdit = this.mode === 'edit';
    const start = isEdit ? moment(this.trip.start) : null;
    const end = (isEdit && this.trip.end) ? moment(this.trip.end) : null;

    this.tripForm = this.fb.group({
      name: [isEdit ? this.trip.name : '', Validators.required],
      fromDate: this.showDate ? [start ? this.dateUtility.getDate(start) : this.defaultDate, Validators.required] : null,
      fromTime: start ? this.dateUtility.getTime(start) : null,
      toDate: end ? this.dateUtility.getDate(end) : (isEdit ? null : this.defaultDate),
      toTime: end ? this.dateUtility.getTime(end) : null,
      drivers: [isEdit ? this.trip.drivers : []],
      vehicles: [isEdit ? this.trip.vehicles : []],
      description: isEdit ? this.trip.description : ''
    });

    this.availableDrivers$ = this.dataStore.getAllDrivers()
      .pipe(map(Utility.filterDeleted), map(ds => ds.map(d => ({id: d.$key, name: d.displayName}))));
    this.availableVehicles$ = this.dataStore.getAllVehicles()
      .pipe(map(Utility.filterDeleted), map(vs => vs.map(v => ({id: v.$key, name: v.displayName}))));
  }

  onSubmit() {
    const val = this.tripForm.value;
    const start = this.dateUtility.toMoment(val.fromDate || moment('1970-01-01', 'YYYY-MM-DD'), val.fromTime)!;
    const end = (val.toDate || val.toTime) ? this.dateUtility.toMoment(val.toDate || this.dateUtility.getDate(start), val.toTime) : null;

    this.save.emit({
      start: start,
      end: (Utility.sameDate(start, end) && !val.toTime) ? null : end,
      name: val.name || '',
      description: val.description || '',
      drivers: val.drivers || [],
      vehicles: val.vehicles || []
    });
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
        this.remove.emit(this.trip);
        this.dialogRef.close();
      }
    });
  }
}
