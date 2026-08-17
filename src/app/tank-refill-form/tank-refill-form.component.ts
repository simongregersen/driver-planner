import {ChangeDetectionStrategy, Component, OnInit, inject, signal} from '@angular/core';
import {AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Moment} from 'moment';
import {NewTankRefill, TankRefill} from '../tank-refill';
import {DataStore} from '../data.service';
import {DateUtility} from '../date-utility';
import {DateFieldComponent} from '../date-field/date-field.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';
import {WriteFeedbackService} from '../write-feedback.service';
import {guardDialogDismissal} from '../dialog-dismiss-guard';

export type TankRefillFormMode = 'create' | 'edit';

// Same rationale as FuelReportFormComponent's identical helpers: a plain text input so a comma
// always works as the decimal separator regardless of the browser's own locale.
function parseDecimal(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDecimal(value: number | null | undefined): string {
  return value == null ? '' : String(value).replace('.', ',');
}

function decimalValidator(control: AbstractControl): ValidationErrors | null {
  if (control.value == null || control.value === '') return null; // Validators.required covers emptiness
  const parsed = parseDecimal(control.value);
  return (parsed != null && parsed >= 0) ? null : {decimal: true};
}

// Create and edit share one form, following FuelReportFormComponent/VehicleFormComponent's
// convention. Only ever opened from FuelTrackingComponent's admin branch — see
// database.rules.json's tankRefills rule for where this is actually enforced.
@Component({
  standalone: true,
  selector: 'app-tank-refill-form',
  templateUrl: './tank-refill-form.component.html',
  styleUrls: ['./tank-refill-form.component.css'],
  imports: [
    ReactiveFormsModule,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule,
    DateFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TankRefillFormComponent implements OnInit {
  mode: TankRefillFormMode = 'create';
  /** Required when mode is 'edit'. */
  record!: TankRefill;

  private readonly dataStore = inject(DataStore);
  private readonly dateUtility = inject(DateUtility);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly writeFeedback = inject(WriteFeedbackService);

  /** True while a submit's write is in flight. Gates the submit button so a slow connection
   * can't turn an impatient second tap into a second record — and stays true for a write that
   * hasn't been acknowledged yet, which offline is every write. See WriteFeedbackService. */
  readonly saving = signal(false);
  readonly dialogRef = inject(MatDialogRef<TankRefillFormComponent>);
  readonly minDate = this.dateUtility.minDate(5);

  tankRefillForm!: FormGroup;


  // Escape / backdrop click ask before discarding typed-in input, rather than
  // destroying it silently. Pristine forms still close instantly. See
  // guardDialogDismissal and DIALOG_CONFIG's disableClose.
  constructor() {
    guardDialogDismissal(this.dialogRef, () => this.tankRefillForm?.dirty ?? false);
  }

  ngOnInit(): void {
    const isEdit = this.mode === 'edit';
    this.tankRefillForm = this.fb.group({
      date: [isEdit ? this.record.date : this.dateUtility.today(), Validators.required],
      liters: [isEdit ? formatDecimal(this.record.liters) : '', [Validators.required, decimalValidator]],
      price: [isEdit ? formatDecimal(this.record.price) : '', [Validators.required, decimalValidator]],
    });
  }

  setDate(value: Moment | null): void {
    this.tankRefillForm.controls['date'].setValue(value);
  }

  onSubmit(): void {
    if (this.saving()) return;
    if (!this.tankRefillForm.valid) return;
    const val = this.tankRefillForm.value;
    const refill: NewTankRefill = {
      date: val.date,
      liters: parseDecimal(val.liters)!,
      price: parseDecimal(val.price)!,
    };
    const saved = this.mode === 'edit'
      ? this.dataStore.updateTankRefill(this.record, refill)
      : this.dataStore.addTankRefill(refill);
    void this.writeFeedback.closeDialogOn(this.dialogRef, saved, this.saving);
  }

  deleteRefill(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: 'Er du sikker på, at du vil slette denne tilførsel til tanken?',
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        void this.writeFeedback.closeDialogOn(
          this.dialogRef, this.dataStore.removeTankRefill(this.record), this.saving, {failureMessage: 'Kunne ikke slette påfyldningen. Prøv igen.'});
      }
    });
  }
}
