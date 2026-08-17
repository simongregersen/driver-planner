import {ChangeDetectionStrategy, Component, OnInit, inject, signal} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import moment, {Moment} from 'moment';
import {Driver, NewDriver} from '../driver';
import {DateUtility} from '../date-utility';
import {DateFieldComponent} from '../date-field/date-field.component';
import {DataStore} from '../data.service';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';
import {WriteFeedbackService} from '../write-feedback.service';
import {guardDialogDismissal} from '../dialog-dismiss-guard';

export type DriverFormMode = 'create' | 'edit';

// Create and edit are the same form (kaldenavn/navn/fødselsdag) with only the title, submit
// label, and initial values differing — replaces the previously separate
// DriverCreatorComponent/DriverEditorComponent, following the same pattern as
// TripFormComponent/VehicleFormComponent.
//
// Saves directly to DataStore itself rather than emitting an output for the caller to persist —
// unlike TripFormComponent, there's only ever one call site (DriversComponent) and one
// persistence path, so there's no context only a caller could supply (compare Trip's
// Templates-vs-regular-day split, which genuinely needs that indirection).
//
// Opened via MatDialog.open() with no data binding — `mode` (and `driver` below) are set
// directly on componentInstance by the caller straight after open(); that assignment happens
// before Angular runs ngOnInit (dialog creation defers it), so ngOnInit sees the final values.
@Component({
  standalone: true,
  selector: 'app-driver-form',
  templateUrl: './driver-form.component.html',
  styleUrls: ['./driver-form.component.css'],
  imports: [
    ReactiveFormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    DateFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DriverFormComponent implements OnInit {
  mode: DriverFormMode = 'create';
  /** Required when mode is 'edit'. */
  driver!: Driver;

  private readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  private readonly writeFeedback = inject(WriteFeedbackService);

  /** True while a submit's write is in flight. Gates the submit button so a slow connection
   * can't turn an impatient second tap into a second record — and stays true for a write that
   * hasn't been acknowledged yet, which offline is every write. See WriteFeedbackService. */
  readonly saving = signal(false);
  readonly dialogRef = inject(MatDialogRef<DriverFormComponent>);
  readonly minDate = moment('1900-01-01', 'YYYY-MM-DD');

  driverForm!: FormGroup;


  // Escape / backdrop click ask before discarding typed-in input, rather than
  // destroying it silently. Pristine forms still close instantly. See
  // guardDialogDismissal and DIALOG_CONFIG's disableClose.
  constructor() {
    guardDialogDismissal(this.dialogRef, () => this.driverForm?.dirty ?? false);
  }

  ngOnInit() {
    const isEdit = this.mode === 'edit';
    this.driverForm = this.fb.group({
      displayName: [isEdit ? this.driver.displayName : '', Validators.required],
      name: [isEdit ? this.driver.name : '', Validators.required],
      birthday: (isEdit && this.driver.birthday) ? this.dateUtility.getDate(this.driver.birthday) : null
    });
  }

  setBirthday(value: Moment | null): void {
    this.driverForm.controls['birthday'].setValue(value);
  }

  onSubmit() {
    if (this.saving()) return;
    const val = this.driverForm.value;
    const driver: NewDriver = {
      displayName: val.displayName || '',
      name: val.name || '',
      birthday: this.dateUtility.toMoment(val.birthday)
    };
    const saved = this.mode === 'edit'
      ? this.dataStore.updateDriver(this.driver, driver)
      : this.dataStore.addDriver(driver.displayName, driver.name, driver.birthday);
    void this.writeFeedback.closeDialogOn(this.dialogRef, saved, this.saving);
  }

  deleteDriver(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: `Er du sikker på, at du vil slette chaufføren\n'${this.driver.displayName}'?`,
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        void this.writeFeedback.closeDialogOn(
          this.dialogRef, this.dataStore.deleteDriver(this.driver), this.saving, {failureMessage: 'Kunne ikke slette chaufføren. Prøv igen.'});
      }
    });
  }
}
