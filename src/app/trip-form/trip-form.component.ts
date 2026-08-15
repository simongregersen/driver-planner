import {ChangeDetectionStrategy, Component, OnInit, inject, output} from '@angular/core';
import {AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators} from '@angular/forms';
import {AsyncPipe} from '@angular/common';
import {COMMA, ENTER} from '@angular/cdk/keycodes';
import {MatButtonModule} from '@angular/material/button';
import {MatChipEditedEvent, MatChipInputEvent, MatChipsModule} from '@angular/material/chips';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import moment, {Moment} from 'moment';
import {SelectOption} from '../select-option';
import {DataStore} from '../data.service';
import {Utility} from '../utility';
import {NewTrip, Trip} from '../trip';
import {combineLatest, Observable} from 'rxjs';
import {distinctUntilChanged, map, startWith, switchMap} from 'rxjs/operators';
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
    MatButtonModule, MatChipsModule, MatDatepickerModule, MatDialogModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatSelectModule, TimeFieldComponent,
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
  /** One warning line per currently-selected driver/vehicle that's also assigned to another,
   * time-overlapping trip — purely informational (see trip-form.component.html), never wired
   * into a validator, so it never affects tripForm.valid or blocks submission. */
  driverWarningMessages$!: Observable<string[]>;
  vehicleWarningMessages$!: Observable<string[]>;

  private readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<TripFormComponent>);
  readonly breakpoints = inject(BreakpointService);
  readonly minDate = this.dateUtility.minDate(5);
  readonly labelSeparatorKeyCodes = [ENTER, COMMA];

  private readonly driverNames$ = this.dataStore.getAllDrivers()
    .pipe(map(ds => new Map(ds.map(d => [d.$key, d.displayName]))));
  private readonly vehicleNames$ = this.dataStore.getAllVehicles()
    .pipe(map(vs => new Map(vs.map(v => [v.$key, v.displayName]))));

  ngOnInit() {
    const isEdit = this.mode === 'edit';
    const start = isEdit ? moment(this.trip.start) : null;
    const end = (isEdit && this.trip.end) ? moment(this.trip.end) : null;

    this.tripForm = this.fb.group({
      name: [isEdit ? this.trip.name : '', Validators.required],
      fromDate: this.showDate ? [start ? this.dateUtility.getDate(start) : this.defaultDate, Validators.required] : null,
      fromTime: start ? this.dateUtility.getTime(start) : null,
      toDate: end ? this.dateUtility.getDate(end) : null,
      toTime: end ? this.dateUtility.getTime(end) : null,
      drivers: [isEdit ? this.trip.drivers : []],
      vehicles: [isEdit ? this.trip.vehicles : []],
      description: isEdit ? this.trip.description : '',
      officeDescription: isEdit ? this.trip.officeDescription : '',
      labels: [isEdit ? (this.trip.labels ?? []) : []]
    }, {validators: this.endAfterStartValidator});

    this.availableDrivers$ = this.dataStore.getAllDrivers()
      .pipe(map(Utility.filterDeleted), map(ds => ds.map(d => ({id: d.$key, name: d.displayName}))));
    this.availableVehicles$ = this.dataStore.getAllVehicles()
      .pipe(map(Utility.filterDeleted), map(vs => vs.map(v => ({id: v.$key, name: v.displayName}))));

    // Refetches candidate trips only when start/end/drivers/vehicles actually change (not on
    // every keystroke in name/description/labels) — computeStartEnd is the same shared helper
    // onSubmit/endAfterStartValidator use, so this can never disagree with them about what
    // start/end the form currently resolves to.
    const relevantChanges$ = this.tripForm.valueChanges.pipe(
      startWith(this.tripForm.value),
      map(val => {
        const {start, end} = this.computeStartEnd(val);
        return {start, end, drivers: (val.drivers ?? []) as string[], vehicles: (val.vehicles ?? []) as string[]};
      }),
      distinctUntilChanged((a, b) => this.relevantChangeKey(a) === this.relevantChangeKey(b)),
    );

    const conflicts$ = relevantChanges$.pipe(
      switchMap(({start, end, drivers, vehicles}) =>
        this.dataStore.getTrips(start, end ?? start).pipe(
          map(candidates => ({
            drivers, vehicles,
            conflicts: Utility.findAssignmentConflicts(
              {key: this.mode === 'edit' ? this.trip.$key : undefined, start, end, drivers, vehicles},
              candidates
            ),
          }))
        )
      )
    );

    this.driverWarningMessages$ = combineLatest([conflicts$, this.driverNames$]).pipe(
      map(([{drivers, conflicts}, names]) =>
        drivers.filter(key => conflicts.driverConflicts.has(key))
          .map(key => this.conflictMessage(names.get(key), conflicts.driverConflicts.get(key)!))
      )
    );
    this.vehicleWarningMessages$ = combineLatest([conflicts$, this.vehicleNames$]).pipe(
      map(([{vehicles, conflicts}, names]) =>
        vehicles.filter(key => conflicts.vehicleConflicts.has(key))
          .map(key => this.conflictMessage(names.get(key), conflicts.vehicleConflicts.get(key)!))
      )
    );
  }

  // Cheap order-insensitive equality key for relevantChanges$'s distinctUntilChanged — the
  // drivers/vehicles arrays' own order can shift as chips are added/removed without the actual
  // assignment set changing.
  private relevantChangeKey(v: {start: Moment; end: Moment | null; drivers: string[]; vehicles: string[]}): string {
    return JSON.stringify([v.start.valueOf(), v.end ? v.end.valueOf() : null, [...v.drivers].sort(), [...v.vehicles].sort()]);
  }

  private conflictMessage(name: string | undefined, conflicts: Trip[]): string {
    const parts = conflicts.map(t => `'${t.name}' ${Utility.timeRangeLabel(t)}`).join(', ');
    return `${name ?? 'Denne ressource'} er allerede tildelt: ${parts}.`;
  }

  // Shared by onSubmit and endAfterStartValidator so the two can never disagree on what
  // start/end a given set of raw form values actually resolves to (a missing toDate falls back
  // to fromDate's day, matching a same-day trip; showDate=false leaves both dates at the same
  // fixed epoch, so only the times end up compared).
  private computeStartEnd(val: {fromDate?: Moment | null; fromTime?: Moment | null; toDate?: Moment | null; toTime?: Moment | null}): {start: Moment; end: Moment | null} {
    const start = this.dateUtility.toMoment(val.fromDate || moment('1970-01-01', 'YYYY-MM-DD'), val.fromTime)!;
    const end = (val.toDate || val.toTime) ? this.dateUtility.toMoment(val.toDate || this.dateUtility.getDate(start), val.toTime) : null;
    return {start, end};
  }

  private readonly endAfterStartValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
    const {start, end} = this.computeStartEnd(group.value);
    return (end && !end.isAfter(start)) ? {endBeforeStart: true} : null;
  };

  addLabel(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) {
      const labels: string[] = this.tripForm.controls['labels'].value || [];
      this.tripForm.controls['labels'].setValue([...labels, value]);
    }
    event.chipInput.clear();
  }

  removeLabel(label: string): void {
    const labels: string[] = this.tripForm.controls['labels'].value || [];
    this.tripForm.controls['labels'].setValue(labels.filter(l => l !== label));
  }

  editLabel(label: string, event: MatChipEditedEvent): void {
    const value = (event.value || '').trim();
    const labels: string[] = this.tripForm.controls['labels'].value || [];
    const index = labels.indexOf(label);
    if (index === -1) return;
    if (!value) {
      this.removeLabel(label);
      return;
    }
    const updated = [...labels];
    updated[index] = value;
    this.tripForm.controls['labels'].setValue(updated);
  }

  onSubmit() {
    const val = this.tripForm.value;
    const {start, end} = this.computeStartEnd(val);

    this.save.emit({
      start: start,
      end: (Utility.sameDate(start, end) && !val.toTime) ? null : end,
      name: val.name || '',
      description: val.description || '',
      officeDescription: val.officeDescription || '',
      labels: val.labels || [],
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
      }
    });
  }
}
