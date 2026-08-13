import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, viewChild} from '@angular/core';
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
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {DataStore} from '../data.service';
import {NewTrip, Trip} from '../trip';
import {Note} from '../note';
import {Utility} from '../utility';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {Moment} from 'moment';
import {DateUtility} from '../date-utility';
import {TripFormComponent} from '../trip-form/trip-form.component';
import {NoteFormComponent} from '../note-form/note-form.component';
import {SelectOption} from '../select-option';
import {TripsComponent} from '../trips/trips.component';
import {ChipFilterComponent} from '../chip-filter/chip-filter.component';
import {CONFIRM_DIALOG_CONFIG, DIALOG_CONFIG} from '../dialog-config';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CollapsibleBottomBarComponent} from '../collapsible-bottom-bar/collapsible-bottom-bar.component';
import {BreakpointService} from '../breakpoint.service';
import {PageHeaderService} from '../page-header.service';

@Component({
  standalone: true,
  selector: 'app-day-plans',
  templateUrl: './day-plans.component.html',
  styleUrls: ['./day-plans.component.css'],
  imports: [
    FormsModule, AsyncPipe, DatePipe,
    MatButtonModule, MatButtonToggleModule, MatDatepickerModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatMenuModule, MatSlideToggleModule,
    TripsComponent, ChipFilterComponent, CollapsibleBottomBarComponent,
  ],
  providers: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayPlansComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  readonly breakpoints = inject(BreakpointService);
  private readonly pageHeader = inject(PageHeaderService);
  private readonly datePipe = inject(DatePipe);

  availableTemplates$!: Observable<SelectOption[]>;
  trips$!: Observable<Trip[]>;
  dayPublic$!: Observable<boolean>;
  notes$!: Observable<Note[]>;
  readonly minDate = this.dateUtility.minDate(5);
  private _selectedDate: Moment = this.dateUtility.today();

  readonly selectedDriverKeys = signal<string[]>([]);
  readonly selectedVehicleKeys = signal<string[]>([]);
  readonly selectedLabelKeys = signal<string[]>([]);
  readonly showOfficeNotes = signal(false);
  readonly showDriverNotes = signal(false);
  readonly showLabels = signal(false);

  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});
  private readonly vehicleList = toSignal(this.dataStore.getAllVehicles(), {initialValue: [] as Vehicle[]});
  readonly driverOptions = computed(() => this.driverList().map(d => ({id: d.$key, name: d.displayName})));
  readonly vehicleOptions = computed(() => this.vehicleList().map(v => ({id: v.$key, name: v.displayName})));
  readonly selectedDriverNames = computed(() =>
    this.driverOptions().filter(o => this.selectedDriverKeys().includes(o.id)).map(o => o.name).join(', ')
  );
  readonly selectedVehicleNames = computed(() =>
    this.vehicleOptions().filter(o => this.selectedVehicleKeys().includes(o.id)).map(o => o.name).join(', ')
  );

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

  removeTrip(trip: Trip) {
    this.dataStore.removeTrip(trip);
  }

  removeDriverFromTrip({trip, driverKey}: {trip: Trip; driverKey: string}) {
    const name = this.driverList().find(d => d.$key === driverKey)?.displayName ?? 'chaufføren';
    this.confirmRemoval(`Er du sikker på, at du vil fjerne ${name} fra turen?`, () =>
      this.dataStore.updateTrip(trip, {drivers: trip.drivers.filter(k => k !== driverKey)}));
  }

  removeVehicleFromTrip({trip, vehicleKey}: {trip: Trip; vehicleKey: string}) {
    const name = this.vehicleList().find(v => v.$key === vehicleKey)?.displayName ?? 'køretøjet';
    this.confirmRemoval(`Er du sikker på, at du vil fjerne ${name} fra turen?`, () =>
      this.dataStore.updateTrip(trip, {vehicles: trip.vehicles.filter(k => k !== vehicleKey)}));
  }

  // Chip removal happens right next to the row-click-to-edit target, and on a phone screen
  // it's easy to hit by mistake — this catches that before it silently changes the trip.
  private confirmRemoval(message: string, onConfirm: () => void): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {message, confirmLabel: 'Fjern', danger: true} as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) onConfirm();
    });
  }

  edit(trip: Trip) {
    const instance = this.dialog.open(TripFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.trip = trip;
    instance.save.subscribe((updates: NewTrip) => this.dataStore.updateTrip(trip, updates));
    instance.remove.subscribe(() => this.removeTrip(trip));
  }

  create() {
    const instance = this.dialog.open(TripFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'create';
    instance.defaultDate = this.selectedDate;
    instance.save.subscribe((t: NewTrip) => this.dataStore.addTrip(t));
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

  filterTrips(trips: Trip[] | null): Trip[] {
    if (!trips) return [];
    const driverKeys = this.selectedDriverKeys();
    const vehicleKeys = this.selectedVehicleKeys();
    const labelKeys = this.selectedLabelKeys();
    return trips.filter(t =>
      (driverKeys.length === 0 || (t.drivers ?? []).some(k => driverKeys.includes(k))) &&
      (vehicleKeys.length === 0 || (t.vehicles ?? []).some(k => vehicleKeys.includes(k))) &&
      (labelKeys.length === 0 || (t.labels ?? []).some(k => labelKeys.includes(k)))
    );
  }

  // Labels are freeform strings on each trip, not a fixed entity list like drivers/vehicles —
  // the filter's own options are just whichever distinct labels actually appear on the day's
  // trips, derived fresh each time rather than stored anywhere.
  labelOptions(trips: Trip[] | null): SelectOption[] {
    if (!trips) return [];
    const labels = new Set<string>();
    trips.forEach(t => (t.labels ?? []).forEach(l => labels.add(l)));
    return Array.from(labels)
      .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}))
      .map(l => ({id: l, name: l}));
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
