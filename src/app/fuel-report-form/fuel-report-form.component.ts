import {ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators} from '@angular/forms';
import {AsyncPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {Moment} from 'moment';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {FuelReport, NewFuelReport} from '../fuel-report';
import {Vehicle} from '../vehicle';
import {Driver} from '../driver';
import {DataStore} from '../data.service';
import {Utility} from '../utility';
import {DateUtility} from '../date-utility';
import {DateFieldComponent} from '../date-field/date-field.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';
import {WriteFeedbackService} from '../write-feedback.service';
import {guardDialogDismissal} from '../dialog-dismiss-guard';
import {formatDecimal, isValidDecimalInput, parseDecimal} from '../decimal-input';

export type FuelReportFormMode = 'create' | 'edit';

function decimalValidator(control: AbstractControl): ValidationErrors | null {
  if (control.value == null || control.value === '') return null; // Validators.required covers emptiness
  return isValidDecimalInput(control.value) ? null : {decimal: true};
}

// Create and edit share one form, following VehicleFormComponent's convention. The vehicle
// itself can only be set on create — since it's the storage key (fuelReports/$vehicleKey/...)
// rather than just a field, changing it on edit would mean moving the record between paths, so
// edit mode shows it as plain read-only text instead (a report against the wrong vehicle is
// deleted and re-created rather than moved).
//
// Opened via MatDialog.open() with no data binding — driverKey/mode/vehicleKey/record are set
// directly on componentInstance by the caller straight after open(); that assignment happens
// before Angular runs ngOnInit (dialog creation defers it), so ngOnInit sees the final values.
@Component({
  standalone: true,
  selector: 'app-fuel-report-form',
  templateUrl: './fuel-report-form.component.html',
  styleUrls: ['./fuel-report-form.component.css'],
  imports: [
    AsyncPipe, ReactiveFormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    DateFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FuelReportFormComponent implements OnInit {
  /** The driver this report is attributed to. Supplied by the caller when a driver reports
   * their own refuelling; left unset for an admin-initiated create, which instead shows a
   * driver picker in the form itself (see driverOptions below). Always required by the time
   * of a create submit, one way or the other. */
  driverKey?: string;
  /** Create + no driverKey only: pre-selects the in-form driver picker (see needsDriverPicker)
   * instead of leaving it blank — an admin filling this in is very often reporting their own
   * refuelling, so this is FuelTrackingComponent passing along the admin's own driver profile
   * (if they have one) as a starting point that's still free to be changed to anyone else. */
  defaultDriverKey?: string;
  mode: FuelReportFormMode = 'create';
  /** Required when mode is 'edit'. */
  vehicleKey!: string;
  /** Required when mode is 'edit'. */
  record!: FuelReport;

  private readonly dataStore = inject(DataStore);
  private readonly dateUtility = inject(DateUtility);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly writeFeedback = inject(WriteFeedbackService);

  /** True while a submit's write is in flight. Gates the submit button so a slow connection
   * can't turn an impatient second tap into a second record — and stays true for a write that
   * hasn't been acknowledged yet, which offline is every write. See WriteFeedbackService. */
  readonly saving = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  readonly dialogRef = inject(MatDialogRef<FuelReportFormComponent>);

  // Both are pickers: exclude deleted drivers/vehicles, same as the selects elsewhere.
  readonly vehicles$: Observable<Vehicle[]> = this.dataStore.getAllVehicles().pipe(map(Utility.filterDeleted));
  readonly drivers$: Observable<Driver[]> = this.dataStore.getAllDrivers().pipe(map(Utility.filterDeleted));
  readonly minDate = this.dateUtility.minDate(5);

  fuelReportForm!: FormGroup;
  /** Only populated (and shown) in edit mode, where the vehicle can no longer be changed. */
  existingVehicleName: string | null = null;
  /** True when nobody supplied a driverKey up front — an admin creating a report on a driver's
   * behalf, rather than a driver reporting their own. Gates the in-form driver picker. */
  needsDriverPicker = false;


  // Escape / backdrop click ask before discarding typed-in input, rather than
  // destroying it silently. Pristine forms still close instantly. See
  // guardDialogDismissal and DIALOG_CONFIG's disableClose.
  constructor() {
    guardDialogDismissal(this.dialogRef, () => this.fuelReportForm?.dirty ?? false);
  }

  ngOnInit(): void {
    const isEdit = this.mode === 'edit';
    this.needsDriverPicker = !isEdit && !this.driverKey;
    this.fuelReportForm = this.fb.group({
      vehicleKey: [null, isEdit ? [] : Validators.required],
      driverKey: [this.needsDriverPicker ? (this.defaultDriverKey ?? null) : null, this.needsDriverPicker ? Validators.required : []],
      date: [isEdit ? this.record.date : this.dateUtility.today(), Validators.required],
      odometerKm: [isEdit ? formatDecimal(this.record.odometerKm) : '', [Validators.required, decimalValidator]],
      liters: [isEdit ? formatDecimal(this.record.liters) : '', [Validators.required, decimalValidator]],
      note: [isEdit ? (this.record.note ?? '') : ''],
    });

    if (isEdit) {
      this.vehicles$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(vehicles => {
        this.existingVehicleName = vehicles.find(v => v.$key === this.vehicleKey)?.displayName ?? 'Ukendt køretøj';
      });
    }
  }

  /** The one message this form shows, in the box at the foot of it — the same reporting
   * TripReportFormComponent and ClockRecordFormComponent use, rather than a mat-error under each
   * field (see the .html for why it moved).
   *
   * Only ever about a value that has actually been given: a required field left empty says
   * nothing, since the submit button being disabled is what covers that, and telling someone off
   * for not yet having filled in a form they just opened is worse than saying nothing. That's
   * also what Material's own error state does for a mat-error, so the messages appear exactly
   * when they used to. */
  error(): string | null {
    const controls = this.fuelReportForm?.controls;
    if (!controls) return null;
    const chosen = (name: string) => controls[name].touched && controls[name].hasError('required');
    if (chosen('vehicleKey')) return 'Vælg et køretøj.';
    if (chosen('driverKey')) return 'Vælg en chauffør.';
    if (controls['odometerKm'].hasError('decimal')) return 'Angiv et gyldigt tal for "Triptæller".';
    if (controls['liters'].hasError('decimal')) return 'Angiv et gyldigt tal for "Brændstof".';
    return null;
  }

  setDate(value: Moment | null): void {
    this.fuelReportForm.controls['date'].setValue(value);
  }

  onSubmit(): void {
    if (this.saving()) return;
    if (!this.fuelReportForm.valid) return;
    const val = this.fuelReportForm.value;
    const saved = this.mode === 'edit'
      ? this.dataStore.updateFuelReport(this.vehicleKey, this.record, {
          date: val.date,
          odometerKm: parseDecimal(val.odometerKm),
          liters: parseDecimal(val.liters),
          note: val.note || '',
        })
      : this.dataStore.addFuelReport(val.vehicleKey, {
          date: val.date,
          driverKey: this.driverKey ?? val.driverKey,
          odometerKm: parseDecimal(val.odometerKm)!,
          liters: parseDecimal(val.liters)!,
          note: val.note || '',
        } as NewFuelReport);
    void this.writeFeedback.closeDialogOn(this.dialogRef, saved, this.saving);
  }

  deleteReport(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: 'Er du sikker på, at du vil slette denne tankning?',
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        void this.writeFeedback.closeDialogOn(
          this.dialogRef, this.dataStore.removeFuelReport(this.vehicleKey, this.record), this.saving, {failureMessage: 'Kunne ikke slette tankningen. Prøv igen.'});
      }
    });
  }
}
