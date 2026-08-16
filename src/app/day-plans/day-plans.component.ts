import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, viewChild} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCalendar, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatSnackBar} from '@angular/material/snack-bar';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSlideToggleChange, MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTooltipModule} from '@angular/material/tooltip';
import {DataStore} from '../data.service';
import {Note} from '../note';
import {Utility} from '../utility';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';
import {map, switchMap, tap} from 'rxjs/operators';
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
import {WriteFeedbackService} from '../write-feedback.service';

@Component({
  standalone: true,
  selector: 'app-day-plans',
  templateUrl: './day-plans.component.html',
  styleUrls: ['./day-plans.component.css'],
  imports: [
    FormsModule, AsyncPipe, DatePipe,
    MatButtonModule, MatButtonToggleModule, MatDatepickerModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatMenuModule, MatProgressSpinnerModule, MatSlideToggleModule, MatTooltipModule,
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
  private readonly writeFeedback = inject(WriteFeedbackService);
  private readonly snackBar = inject(MatSnackBar);

  availableTemplates$!: Observable<SelectOption[]>;
  readonly minDate = this.dateUtility.minDate(5);

  readonly selectedDate = signal<Moment>(this.dateUtility.today());

  // True from the moment a new date is selected until that date's trips actually arrive — lets
  // the template show the same loading state a filter/view-toggle change does (see
  // TripFilterStateService.isFiltering), instead of leaving the previous date's trips on screen
  // while a new Firebase listener spins up.
  readonly isLoadingTrips = signal(false);

  /** Disables the Skabelon menu while an insert is in flight — it writes one trip per template
   * entry, so a double-click would duplicate the whole template. */
  readonly insertingTemplate = signal(false);

  readonly trips = toSignal(
    toObservable(this.selectedDate).pipe(
      tap(() => this.isLoadingTrips.set(true)),
      // ...WithOffice: this page shows the admin-only officeDescription/labels, which live in
      // the separate admin-readable /tripOffice node rather than on the trip itself.
      switchMap(date => this.dataStore.getTripsWithOffice(date)),
      tap(() => this.isLoadingTrips.set(false)),
    )
  );
  readonly dayPublic = toSignal(
    toObservable(this.selectedDate).pipe(switchMap(date => this.dataStore.getDayPublic(date))),
    {initialValue: false}
  );

  // Factory-produced computed()s (see TripFilterStateService) — created once here, referenced
  // (not called) from the template, so they actually memoize instead of re-filtering/re-scanning
  // on every change-detection pass.
  readonly filteredTrips = this.filterState.filterTrips(this.trips);
  readonly tripWarnings = this.filterState.tripWarnings(this.trips);
  readonly labelOptions = this.filterState.labelOptions(this.trips);

  // Only needed here to resolve a note's driver/vehicle keys to display names — unrelated to
  // trip filtering/editing, so it stays local rather than living on either shared service.
  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});
  private readonly vehicleList = toSignal(this.dataStore.getAllVehicles(), {initialValue: [] as Vehicle[]});

  private readonly notes = toSignal(this.dataStore.getAllNotes(), {initialValue: [] as Note[]});
  readonly visibleNotes = computed(() => this.notes().filter(n => Utility.noteAppliesToDate(n, this.selectedDate())));

  // Driver/vehicle display names for each visible note, keyed by $key — built once per change
  // instead of re-resolving them per note on every change-detection pass.
  readonly noteNames = computed(() => {
    const drivers = this.driverList();
    const vehicles = this.vehicleList();
    const names = new Map<string, {drivers: string; vehicles: string}>();
    for (const note of this.visibleNotes()) {
      names.set(note.$key, {
        drivers: (note.drivers || [])
          .map(k => drivers.find(d => d.$key === k)?.displayName)
          .filter((name): name is string => !!name)
          .join(', '),
        vehicles: (note.vehicles || [])
          .map(k => vehicles.find(v => v.$key === k)?.displayName)
          .filter((name): name is string => !!name)
          .join(', '),
      });
    }
    return names;
  });

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
    effect(() => {
      this.pageHeader.set('Dagsplan', this.datePipe.transform(this.selectedDate().toDate(), 'EEEE, d MMMM y'));
    });
  }

  ngOnInit(): void {
    this.availableTemplates$ = this.dataStore.getAllTemplates()
      .pipe(map(ts => ts.map(t => ({id: t.$key, name: t.name}))));
  }

  isPublicDate(date: Moment, publicDates: string[]): boolean {
    return publicDates.includes(this.dateUtility.dateKey(date));
  }

  previousDay() {
    this.selectedDate.set(this.dateUtility.addDays(this.selectedDate(), -1));
  }

  nextDay() {
    this.selectedDate.set(this.dateUtility.addDays(this.selectedDate(), 1));
  }

  goToToday() {
    this.selectedDate.set(this.dateUtility.today());
  }

  isToday(): boolean {
    return this.dateUtility.equals(this.selectedDate(), this.dateUtility.today());
  }

  create() {
    this.tripEditing.create(this.selectedDate());
  }

  // Notes save themselves directly to DataStore (see NoteFormComponent) — no save/remove
  // output to subscribe to here, unlike trips.
  createNote() {
    const instance = this.dialog.open(NoteFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'create';
    instance.defaultDate = this.selectedDate();
  }

  editNote(note: Note) {
    const instance = this.dialog.open(NoteFormComponent, DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.note = note;
  }

  insertTemplateWithConfirm(templateId: string, templateName: string) {
    const date = this.selectedDate();
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        title: 'Indsæt skabelon',
        // Naming the target date matters: this is reached from a menu, and inserting into the
        // wrong day creates N trips that then have to be deleted one at a time.
        message: `Indsæt skabelonen '${templateName}' på ${this.datePipe.transform(date.toDate(), 'EEEE d. MMMM y')}?`,
        confirmLabel: 'Indsæt',
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) void this.insertTemplate(date, templateId);
    });
  }

  private async insertTemplate(date: Moment, templateId: string): Promise<void> {
    this.insertingTemplate.set(true);
    try {
      const keys = await this.dataStore.insertTemplate(date, templateId);
      if (!keys.length) {
        this.snackBar.open('Skabelonen indeholder ingen ture.', 'OK', {duration: 4000});
        return;
      }
      // Undo rather than a confirm-only flow: the confirm dialog can't catch inserting the right
      // template on the wrong day, and unpicking it by hand is N row-click → dialog → Slet →
      // confirm cycles. removeTrips is a single atomic multi-path delete, so this is cheap.
      this.snackBar
        .open(`${keys.length} ${keys.length === 1 ? 'tur' : 'ture'} indsat.`, 'Fortryd', {duration: 8000})
        .onAction()
        .subscribe(() => void this.writeFeedback.run(this.dataStore.removeTrips(keys), {
          failureMessage: 'Kunne ikke fortryde indsættelsen. Prøv igen.',
        }));
    } catch (err) {
      console.error('Could not insert template', err);
      this.snackBar.open('Kunne ikke indsætte skabelonen. Prøv igen.', 'OK', {duration: 6000});
    } finally {
      this.insertingTemplate.set(false);
    }
  }

  /** The calendar and the date input both hand back null when a selection is cleared. */
  onDateSelected(date: Moment | null) {
    if (date) this.selectedDate.set(date);
  }

  // The highest-consequence action on this page — it's what publishes the day to drivers and
  // arms the change-notification path. [checked] is bound one-way to the stored signal, so a
  // rejected write left the switch sitting wherever the user's thumb put it: the signal never
  // changed, so Angular never wrote the old value back, and the admin walked away believing a
  // day was published when it wasn't. Resetting it from $event.source on failure is what makes
  // the control tell the truth again.
  setDayPublic(event: MatSlideToggleChange) {
    void this.writeFeedback
      .run(this.dataStore.setDayPublic(this.selectedDate(), event.checked), {
        failureMessage: 'Kunne ikke ændre synligheden. Prøv igen.',
        pendingMessage: 'Ingen forbindelse — synligheden ændres, når du er online igen. Hold appen åben.',
      })
      .then(outcome => {
        if (outcome === 'failed') event.source.checked = this.dayPublic();
      });
  }

}
