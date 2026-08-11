import {afterRenderEffect, ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, viewChild} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatCalendar, MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {Observable} from 'rxjs';
import moment, {Moment} from 'moment';
import {Trip} from '../trip';
import {Driver} from '../driver';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {AuthenticationService} from '../authentication.service';
import {Utility} from '../utility';
import {DateUtility} from '../date-utility';
import {TripsComponent} from '../trips/trips.component';
import {CollapsibleBottomBarComponent} from '../collapsible-bottom-bar/collapsible-bottom-bar.component';

@Component({
  standalone: true,
  selector: 'app-my-trips',
  templateUrl: './my-trips.component.html',
  styleUrls: ['./my-trips.component.css'],
  imports: [
    FormsModule, AsyncPipe, DatePipe,
    MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule,
    TripsComponent, CollapsibleBottomBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTripsComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  readonly userService = inject(UserService);
  readonly dateUtility = inject(DateUtility);
  private readonly authService = inject(AuthenticationService);
  private readonly destroyRef = inject(DestroyRef);

  trips$!: Observable<Trip[]>;
  dayPublic$!: Observable<boolean>;
  readonly minDate = this.dateUtility.minDate(5);
  readonly minDateInputValue = this.dateUtility.toDateInputValue(this.minDate);
  private _selectedDate: Moment = this.dateUtility.today();

  private readonly calendar = viewChild<MatCalendar<Moment>>(MatCalendar);
  private readonly publicDates = toSignal(this.dataStore.getPublicDates(), {initialValue: [] as string[]});

  readonly dateFilter = computed<(date: Moment | null) => boolean>(() => {
    const publicDates = this.publicDates();
    return date => !!date && this.isPublicDate(date, publicDates);
  });

  constructor() {
    // A calendar only rebuilds its cells on an explicit refresh, never on a new dateFilter
    // alone. This has to run *after* render, so the calendar has already received the new
    // dateFilter binding by the time it re-reads it.
    afterRenderEffect(() => {
      this.dateFilter();
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
    const date = this.adjacentPublicDate(-1);
    if (date) this.selectedDate = date;
  }

  nextDay() {
    const date = this.adjacentPublicDate(1);
    if (date) this.selectedDate = date;
  }

  hasPreviousPublicDate(): boolean {
    return !!this.adjacentPublicDate(-1);
  }

  hasNextPublicDate(): boolean {
    return !!this.adjacentPublicDate(1);
  }

  // Previous/next skip over non-public gaps rather than landing on a disabled day, so they
  // always agree with what the datepicker filter allows a user to pick directly.
  private adjacentPublicDate(direction: 1 | -1): Moment | null {
    const currentKey = this.dateUtility.dateKey(this.selectedDate);
    const publicDates = [...this.publicDates()].sort();
    const key = direction > 0
      ? publicDates.find(k => k > currentKey)
      : publicDates.reverse().find(k => k < currentKey);
    return key ? moment(key, 'YYYY-MM-DD') : null;
  }

  goToToday() {
    this.selectedDate = this.dateUtility.today();
  }

  isToday(): boolean {
    return this.dateUtility.equals(this.selectedDate, this.dateUtility.today());
  }

  filterMyTrips(trips: Trip[] | null, driver: Driver | null): Trip[] {
    if (!trips || !driver) return [];
    return trips.filter(t => Utility.isAssigned(driver, t));
  }

  /** The calendar and the date input both hand back null when a selection is cleared. */
  onDateSelected(date: Moment | null) {
    if (date) this.selectedDate = date;
  }

  nativeDateValue(): string {
    return this.dateUtility.toDateInputValue(this.selectedDate);
  }

  onNativeDateChange(event: Event): void {
    this.onDateSelected(this.dateUtility.parseDateInputValue((event.target as HTMLInputElement).value));
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
