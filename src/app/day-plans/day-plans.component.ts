import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, inject, OnInit, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCalendar, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {DataStore} from '../data.service';
import {Trip} from '../trip';
import {Note} from '../note';
import {Utility} from '../utility';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {Moment} from 'moment';
import {DateUtility} from '../date-utility';
import {NoteFormComponent} from '../note-form/note-form.component';
import {SelectOption} from '../select-option';
import {TripsComponent} from '../trips/trips.component';
import {ChipFilterComponent} from '../chip-filter/chip-filter.component';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG} from '../dialog-config';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CollapsibleBottomBarComponent} from '../collapsible-bottom-bar/collapsible-bottom-bar.component';
import {BreakpointService} from '../breakpoint.service';
import {PageHeaderService} from '../page-header.service';
import {TripFilterStateService} from '../trip-filter-state.service';
import {TripEditingService} from '../trip-editing.service';

@Component({
  standalone: true,
  selector: 'app-day-plans',
  templateUrl: './day-plans.component.html',
  styleUrls: ['./day-plans.component.css'],
  imports: [
    FormsModule, AsyncPipe, DatePipe,
    MatButtonModule, MatButtonToggleModule, MatDatepickerModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatMenuModule, MatProgressSpinnerModule, MatSlideToggleModule,
    TripsComponent, ChipFilterComponent, CollapsibleBottomBarComponent,
  ],
  providers: [DatePipe, TripFilterStateService, TripEditingService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayPlansComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  readonly breakpoints = inject(BreakpointService);
  private readonly pageHeader = inject(PageHeaderService);
  private readonly datePipe = inject(DatePipe);
  readonly filterState = inject(TripFilterStateService);
  readonly tripEditing = inject(TripEditingService);

  availableTemplates$!: Observable<SelectOption[]>;
  trips$!: Observable<Trip[]>;
  dayPublic$!: Observable<boolean>;
  notes$!: Observable<Note[]>;
  readonly minDate = this.dateUtility.minDate(5);
  private _selectedDate: Moment = this.dateUtility.today();

  // Only needed here to resolve a note's driver/vehicle keys to display names — unrelated to
  // trip filtering/editing, so it stays local rather than living on either shared service.
  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});
  private readonly vehicleList = toSignal(this.dataStore.getAllVehicles(), {initialValue: [] as Vehicle[]});

  private readonly calendar = viewChild<MatCalendar<Moment>>(MatCalendar);
  private readonly publicDates = toSignal(this.dataStore.getPublicDates(), {initialValue: [] as string[]});

  readonly dateClass = computed<MatCalendarCellClassFunction<Moment>>(() => {
    const publicDates = this.publicDates();
    return date => this.isPublicDate(date, publicDates) ? 'public-day' : '';
  });

  constructor() {
    // A calendar only rebuilds its cells on an explicit refresh, never on a new dateClass
    // alone. This has to run *after* render, so the calendar has already received the new
    // dateClass binding by the time it re-reads it.
    afterRenderEffect(() => {
      this.dateClass();
      this.calendar()?.updateTodaysDate();
    });
  }

  ngOnInit(): void {
    this.selectedDate = this.dateUtility.today();
    this.availableTemplates$ = this.dataStore.getAllTemplates()
      .pipe(map(ts => ts.map(t => ({id: t.$key, name: t.name}))));
    this.notes$ = this.dataStore.getAllNotes();
  }

  isPublicDate(date: Moment, publicDates: string[]): boolean {
    return publicDates.includes(this.dateUtility.dateKey(date));
  }

  previousDay() {
    this.selectedDate = this.dateUtility.addDays(this.selectedDate, -1);
  }

  nextDay() {
    this.selectedDate = this.dateUtility.addDays(this.selectedDate, 1);
  }

  goToToday() {
    this.selectedDate = this.dateUtility.today();
  }

  isToday(): boolean {
    return this.dateUtility.equals(this.selectedDate, this.dateUtility.today());
  }

  create() {
    this.tripEditing.create(this.selectedDate);
  }

  // Notes save themselves directly to DataStore (see NoteFormComponent) — no save/remove
  // output to subscribe to here, unlike trips.
  createNote() {
    const instance = this.dialog.open(NoteFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'create';
    instance.defaultDate = this.selectedDate;
  }

  editNote(note: Note) {
    const instance = this.dialog.open(NoteFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.note = note;
  }

  notesForDate(notes: Note[] | null, date: Moment): Note[] {
    if (!notes) return [];
    return notes.filter(n => Utility.noteAppliesToDate(n, date));
  }

  noteDriverNames(note: Note): string {
    return (note.drivers || [])
      .map(k => this.driverList().find(d => d.$key === k)?.displayName)
      .filter((name): name is string => !!name)
      .join(', ');
  }

  noteVehicleNames(note: Note): string {
    return (note.vehicles || [])
      .map(k => this.vehicleList().find(v => v.$key === k)?.displayName)
      .filter((name): name is string => !!name)
      .join(', ');
  }

  insertTemplateWithConfirm(templateId: string, templateName: string) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        title: 'Indsæt skabelon',
        message: `Er du sikker på, at du vil indsætte skabelonen\n'${templateName}'?`,
        confirmLabel: 'Indsæt',
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) this.dataStore.insertTemplate(this.selectedDate, templateId);
    });
  }

  /** The calendar and the date input both hand back null when a selection is cleared. */
  onDateSelected(date: Moment | null) {
    if (date) this.selectedDate = date;
  }

  set selectedDate(date: Moment) {
    this._selectedDate = date;
    this.trips$ = this.dataStore.getTrips(date);
    this.dayPublic$ = this.dataStore.getDayPublic(date);
    this.pageHeader.set('Dagsplan', this.datePipe.transform(date.toDate(), 'EEEE, d MMMM y'));
  }

  get selectedDate(): Moment {
    return this._selectedDate;
  }

  setDayPublic(isPublic: boolean) {
    this.dataStore.setDayPublic(this.selectedDate, isPublic);
  }

}
