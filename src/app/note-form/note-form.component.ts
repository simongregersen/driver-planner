import {ChangeDetectionStrategy, Component, OnInit, inject} from '@angular/core';
import {AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators} from '@angular/forms';
import {AsyncPipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {Moment} from 'moment';
import {SelectOption} from '../select-option';
import {DataStore} from '../data.service';
import {Utility} from '../utility';
import {NewNote, Note} from '../note';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {DateFieldComponent} from '../date-field/date-field.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG} from '../dialog-config';

export type NoteFormMode = 'create' | 'edit';

// Create and edit are the same form (text/fra dato/til dato/chauffører/køretøjer) with only the
// title, submit label, and whether a delete button shows differing — same merged-component
// pattern as TripFormComponent/DriverFormComponent/VehicleFormComponent.
//
// Saves directly to DataStore itself rather than emitting an output for the caller to persist —
// there's only ever one call site (DayPlansComponent) and one persistence path, so there's no
// context only a caller could supply.
//
// Opened via MatDialog.open() with no data binding — `mode` (and `note`/`defaultDate` below) are
// set directly on componentInstance by the caller straight after open(); that assignment happens
// before Angular runs ngOnInit (dialog creation defers it), so ngOnInit sees the final values.
@Component({
  standalone: true,
  selector: 'app-note-form',
  templateUrl: './note-form.component.html',
  styleUrls: ['./note-form.component.css'],
  imports: [
    ReactiveFormsModule, AsyncPipe,
    MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    DateFieldComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NoteFormComponent implements OnInit {
  mode: NoteFormMode = 'create';
  /** Required when mode is 'edit'. */
  note!: Note;
  /** Used when mode is 'create' only — start defaults to this day; end is left blank so a
   * single-day note isn't just an unconsidered default, it's a deliberate choice. */
  defaultDate: Moment | null = null;

  availableDrivers$!: Observable<SelectOption[]>;
  availableVehicles$!: Observable<SelectOption[]>;
  noteForm!: FormGroup;

  private readonly dataStore = inject(DataStore);
  private readonly fb = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<NoteFormComponent>);

  ngOnInit() {
    const isEdit = this.mode === 'edit';

    this.noteForm = this.fb.group({
      text: [isEdit ? this.note.text : '', Validators.required],
      start: [isEdit ? this.note.start : this.defaultDate, Validators.required],
      end: isEdit ? this.note.end : null,
      drivers: [isEdit ? this.note.drivers : []],
      vehicles: [isEdit ? this.note.vehicles : []]
    }, {validators: this.endBeforeStartValidator});

    this.availableDrivers$ = this.dataStore.getAllDrivers()
      .pipe(map(Utility.filterDeleted), map(ds => ds.map(d => ({id: d.$key, name: d.displayName}))));
    this.availableVehicles$ = this.dataStore.getAllVehicles()
      .pipe(map(Utility.filterDeleted), map(vs => vs.map(v => ({id: v.$key, name: v.displayName}))));
  }

  setStart(value: Moment | null): void {
    this.noteForm.controls['start'].setValue(value);
  }

  setEnd(value: Moment | null): void {
    this.noteForm.controls['end'].setValue(value);
  }

  // Dates only (no time), so same-day is a valid single-day note — only a strictly earlier end
  // is rejected.
  private readonly endBeforeStartValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
    const {start, end} = group.value;
    return (start && end && (end as Moment).isBefore(start, 'day')) ? {endBeforeStart: true} : null;
  };

  onSubmit() {
    const val = this.noteForm.value;
    const note: NewNote = {
      start: val.start,
      // A blank Til dato is a single-day note, not an incomplete one — same fallback TripForm
      // uses for a blank toDate.
      end: val.end || val.start,
      text: val.text || '',
      drivers: val.drivers || [],
      vehicles: val.vehicles || []
    };
    if (this.mode === 'edit') {
      this.dataStore.updateNote(this.note, note);
    } else {
      this.dataStore.addNote(note);
    }
  }

  deleteNote(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: 'Er du sikker på, at du vil slette denne note?',
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.dataStore.removeNote(this.note);
        this.dialogRef.close();
      }
    });
  }
}
