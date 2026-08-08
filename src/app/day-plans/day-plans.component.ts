import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, inject, OnInit, viewChild} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCalendar, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatMenuModule} from '@angular/material/menu';
import {MatSelectModule} from '@angular/material/select';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {DataStore} from '../data.service';
import {NewTrip, Trip, TripReport} from '../trip';
import {Driver} from '../driver';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {Moment} from 'moment';
import {DateUtility} from '../date-utility';
import {Utility} from '../utility';
import {TripEditorComponent} from '../trip-editor/trip-editor.component';
import {SelectOption} from '../select-option';
import {TripCreatorComponent} from '../trip-creator/trip-creator.component';
import {TripReportComponent} from '../trip-report/trip-report.component';
import {TripsComponent} from '../trips/trips.component';
import {DIALOG_CONFIG, SMALL_DIALOG_CONFIG} from '../dialog-config';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';

@Component({
  standalone: true,
  selector: 'app-day-plans',
  templateUrl: './day-plans.component.html',
  styleUrls: ['./day-plans.component.css'],
  imports: [
    FormsModule, AsyncPipe, DatePipe,
    MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatIconModule,
    MatInputModule, MatMenuModule, MatSelectModule, MatSlideToggleModule,
    TripsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DayPlansComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);

  drivers!: Observable<Driver[]>;
  availableTemplates$!: Observable<SelectOption[]>;
  trips$!: Observable<Trip[]>;
  dayPublic$!: Observable<boolean>;
  readonly minDate = this.dateUtility.minDate(5);
  private _selectedDriver: Driver | null = null;
  private _selectedDate: Moment = this.dateUtility.today();

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
    this.drivers = this.dataStore.getAllDrivers();
    this.availableTemplates$ = this.dataStore.getAllTemplates()
      .pipe(map(ts => ts.map(t => ({id: t.$key, name: t.name}))));
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

  removeTrip(trip: Trip) {
    this.dataStore.removeTrip(trip);
  }

  edit(trip: Trip) {
    const dialogRef = this.dialog.open(TripEditorComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.edit(trip, (t: Trip, u: any) => this.dataStore.updateTrip(t, u), (t: Trip) => this.removeTrip(t));
  }

  create() {
    const dialogRef = this.dialog.open(TripCreatorComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.defaultDate = this.selectedDate;
    dialogRef.componentInstance.create.subscribe((t: NewTrip) => this.dataStore.addTrip(t));
  }

  openTripReport(trip: Trip) {
    const dialogRef = this.dialog.open(TripReportComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.edit(trip, (t: Trip, driverKey: string, report: TripReport) => this.dataStore.updateTripReport(t, driverKey, report));
  }

  insertTemplateWithConfirm(templateId: string, templateName: string) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...SMALL_DIALOG_CONFIG,
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

  filterTripsByDriver(trips: Trip[] | null): Trip[] {
    if (!trips) return [];
    if (!this._selectedDriver) return trips;
    return trips.filter(t => Utility.isAssigned(this._selectedDriver!, t));
  }

  set selectedDriver(driver: Driver | null) {
    this._selectedDriver = (driver && this._selectedDriver?.$key === driver.$key) ? null : driver;
  }

  get selectedDriver(): Driver | null {
    return this._selectedDriver;
  }

  compareDrivers(a: Driver | null, b: Driver | null): boolean {
    return a?.$key === b?.$key;
  }

  /** The calendar and the date input both hand back null when a selection is cleared. */
  onDateSelected(date: Moment | null) {
    if (date) this.selectedDate = date;
  }

  set selectedDate(date: Moment) {
    this._selectedDate = date;
    this.trips$ = this.dataStore.getTrips(date);
    this.dayPublic$ = this.dataStore.getDayPublic(date);
  }

  get selectedDate(): Moment {
    return this._selectedDate;
  }

  setDayPublic(isPublic: boolean) {
    this.dataStore.setDayPublic(this.selectedDate, isPublic);
  }

}
