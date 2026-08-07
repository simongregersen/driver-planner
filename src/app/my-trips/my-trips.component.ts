import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, viewChild} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCalendar, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Observable} from 'rxjs';
import {Moment} from 'moment';
import {Trip, TripReport} from '../trip';
import {Driver} from '../driver';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {AuthenticationService} from '../authentication.service';
import {Utility} from '../utility';
import {DateUtility} from '../date-utility';
import {TripsComponent} from '../trips/trips.component';
import {TripReportComponent} from '../trip-report/trip-report.component';
import {DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-my-trips',
  templateUrl: './my-trips.component.html',
  styleUrls: ['./my-trips.component.css'],
  imports: [
    FormsModule, AsyncPipe, DatePipe,
    MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule,
    TripsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTripsComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  readonly userService = inject(UserService);
  readonly dateUtility = inject(DateUtility);
  private readonly authService = inject(AuthenticationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);

  trips$!: Observable<Trip[]>;
  dayPublic$!: Observable<boolean>;
  readonly minDate = this.dateUtility.minDate(5);
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
    this.userService.driverProfile$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(driver => {
        if (driver?.deleted) {
          this.authService.logout();
        }
      });

    this.selectedDate = this.dateUtility.today();
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

  filterMyTrips(trips: Trip[] | null, driver: Driver | null): Trip[] {
    if (!trips || !driver) return [];
    return trips.filter(t => Utility.isAssigned(driver, t));
  }

  openTripReport(trip: Trip, driverKey: string) {
    const dialogRef = this.dialog.open(TripReportComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.edit(trip, (t: Trip, dKey: string, report: TripReport) => this.dataStore.updateTripReport(t, dKey, report), driverKey);
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

}
