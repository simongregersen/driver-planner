import {ChangeDetectionStrategy, Component, computed, inject, OnInit, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {DateRange, MatCalendarCellClassFunction, MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {Moment} from 'moment';
import {of} from 'rxjs';
import {switchMap, tap} from 'rxjs/operators';
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
    DatePipe,
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

  readonly from = signal<Moment | null>(null);
  readonly to = signal<Moment | null>(null);
  readonly minDate = this.dateUtility.minDate(5);

  // The calendar renders the from/to highlight itself once it is handed a DateRange.
  selectedRange = new DateRange<Moment>(null, null);

  readonly dateClass: MatCalendarCellClassFunction<Moment> = date =>
    this.dateUtility.isPast(date) ? 'past-day' : '';

  // Only committed once both ends of the range are chosen (mirrors the old fetchTrips()
  // timing) — so a still-in-progress range selection (one end picked, not the other) keeps
  // showing the last complete range's data instead of flashing a loading state.
  private readonly fetchedRange = signal<{from: Moment; to: Moment} | null>(null);

  readonly range = computed(() => {
    const r = this.fetchedRange();
    return r ? this.dateUtility.range(r.from, r.to) : [];
  });

  // True from the moment a new (complete) range is committed until that range's trips actually
  // arrive — lets the template show the same loading state a filter/view-toggle change does
  // (see TripFilterStateService.isFiltering), instead of leaving the previous range's trips on
  // screen while a new Firebase listener spins up.
  readonly isLoadingTrips = signal(false);

  readonly trips = toSignal(
    toObservable(this.fetchedRange).pipe(
      tap(() => this.isLoadingTrips.set(true)),
      switchMap(r => r ? this.dataStore.getTrips(r.from, r.to) : of(null)),
      tap(() => this.isLoadingTrips.set(false)),
    )
  );

  // Factory-produced computed()s (see TripFilterStateService) — created once here, referenced
  // (not called) from the template, so they actually memoize instead of re-filtering/re-scanning
  // on every change-detection pass.
  readonly filteredTrips = this.filterState.filterTrips(this.trips);
  readonly tripWarnings = this.filterState.tripWarnings(this.trips);
  readonly labelOptions = this.filterState.labelOptions(this.trips);

  // Every trip in filteredTrips(), bucketed under each date in range() it overlaps (overlap, not
  // just "starts on this date" — a multi-day trip should show up on every day it spans) — built
  // once per change instead of re-filtering the whole list once per date in the @for.
  readonly tripsByDate = computed(() => {
    const filtered = this.filteredTrips();
    const map = new Map<string, Trip[]>();
    for (const date of this.range()) {
      const start = this.dateUtility.toMoment(date)!;
      const end = this.dateUtility.toMoment(this.dateUtility.addDays(date, 1))!;
      map.set(this.dateUtility.dateKey(date), filtered.filter(t => Utility.tripOverlaps(t, start, end)));
    }
    return map;
  });

  ngOnInit(): void {
    const from = this.dateUtility.today();
    const to = this.dateUtility.addDays(from, 6);
    this.from.set(from);
    this.to.set(to);
    this.updateRange();
    this.commitFetch();
  }

  onDateChange(date: Moment | null) {
    if (!date) return;
    const from = this.from();
    const to = this.to();

    if (!from && !to) {
      this.from.set(date);
    } else if (from && !to && this.dateUtility.after(date, from)) {
      this.to.set(date);
      this.commitFetch();
    } else {
      this.to.set(null);
      this.from.set(date);
    }
    this.updateRange();
  }

  // The compact range field (mobile collapsed bar — see .period-picker-row) sets each end
  // directly via its own two inputs, rather than through the inline calendar's two-click
  // sequence above.
  setFrom(date: Moment | null): void {
    if (!date) return;
    this.from.set(date);
    this.updateRange();
    this.commitFetch();
  }

  setTo(date: Moment | null): void {
    if (!date) return;
    this.to.set(date);
    this.updateRange();
    this.commitFetch();
  }

  private commitFetch(): void {
    const from = this.from();
    const to = this.to();
    if (from && to) this.fetchedRange.set({from, to});
  }

  private updateRange(): void {
    this.selectedRange = new DateRange<Moment>(this.from(), this.to());
    const from = this.from() ? this.datePipe.transform(this.from()!.toDate(), 'EEEE, d MMMM') : '';
    const to = this.to() ? this.datePipe.transform(this.to()!.toDate(), 'EEEE, d MMMM') : '';
    this.pageHeader.set('Periodeplan', to ? `${from} - ${to}` : from);
  }

}
