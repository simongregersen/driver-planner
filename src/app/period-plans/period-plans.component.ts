import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {DateRange, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {Moment} from 'moment';
import {Observable} from 'rxjs';
import {DateUtility} from '../date-utility';
import {DataStore} from '../data.service';
import {Trip} from '../trip';
import {Utility} from '../utility';
import {TripsComponent} from '../trips/trips.component';
import {ChipFilterComponent} from '../chip-filter/chip-filter.component';
import {CollapsibleBottomBarComponent} from '../collapsible-bottom-bar/collapsible-bottom-bar.component';
import {BreakpointService} from '../breakpoint.service';
import {PageHeaderService} from '../page-header.service';
import {TripFilterStateService} from '../trip-filter-state.service';
import {TripEditingService} from '../trip-editing.service';

@Component({
  standalone: true,
  selector: 'app-driver-plans',
  templateUrl: './period-plans.component.html',
  styleUrls: ['./period-plans.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatButtonToggleModule, MatDatepickerModule, MatFormFieldModule, MatProgressSpinnerModule,
    TripsComponent, ChipFilterComponent, CollapsibleBottomBarComponent,
  ],
  providers: [DatePipe, TripFilterStateService, TripEditingService],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PeriodPlansComponent implements OnInit {
  readonly dateUtility = inject(DateUtility);
  readonly dataStore = inject(DataStore);
  readonly breakpoints = inject(BreakpointService);
  private readonly pageHeader = inject(PageHeaderService);
  private readonly datePipe = inject(DatePipe);
  readonly filterState = inject(TripFilterStateService);
  readonly tripEditing = inject(TripEditingService);

  from: Moment | null = null;
  to: Moment | null = null;
  range!: Moment[];
  trips$!: Observable<Trip[]>;
  readonly minDate = this.dateUtility.minDate(5);

  // The calendar renders the from/to highlight itself once it is handed a DateRange.
  selectedRange = new DateRange<Moment>(null, null);

  readonly dateClass: MatCalendarCellClassFunction<Moment> = date =>
    this.dateUtility.isPast(date) ? 'past-day' : '';

  ngOnInit(): void {
    this.from = this.dateUtility.today();
    this.to = this.dateUtility.addDays(this.from, 6);
    this.updateRange();
    this.fetchTrips();
  }

  onDateChange(date: Moment | null) {
    if (!date) return;

    if (!this.from && !this.to) {
      this.from = date;
    } else if (this.from && !this.to && this.dateUtility.after(date, this.from)) {
      this.to = date;
      this.fetchTrips();
    } else {
      this.to = null;
      this.from = date;
    }
    this.updateRange();
  }

  // The compact range field (mobile collapsed bar — see .period-picker-row) sets each end
  // directly via its own two inputs, rather than through the inline calendar's two-click
  // sequence above.
  setFrom(date: Moment | null): void {
    if (!date) return;
    this.from = date;
    this.updateRange();
    this.fetchTrips();
  }

  setTo(date: Moment | null): void {
    if (!date) return;
    this.to = date;
    this.updateRange();
    this.fetchTrips();
  }

  fetchTrips(): void {
    this.range = this.dateUtility.range(this.from!, this.to);
    this.trips$ = this.dataStore.getTrips(this.from!, this.to!);
  }

  // Overlap, not just "starts on this date" — a multi-day trip should show up on every day it
  // spans, not only the one it started on.
  filterByDate(trips: Trip[], date: Moment): Trip[] {
    if (!trips || !trips.length) return [];

    const start = this.dateUtility.toMoment(date)!;
    const end = this.dateUtility.toMoment(this.dateUtility.addDays(date, 1))!;
    return trips.filter(t => Utility.tripOverlaps(t, start, end));
  }

  private updateRange(): void {
    this.selectedRange = new DateRange<Moment>(this.from, this.to);
    const from = this.from ? this.datePipe.transform(this.from.toDate(), 'EEEE, d MMMM') : '';
    const to = this.to ? this.datePipe.transform(this.to.toDate(), 'EEEE, d MMMM') : '';
    this.pageHeader.set('Periodeplan', to ? `${from} - ${to}` : from);
  }

}
