import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatSelectModule} from '@angular/material/select';
import {MatTooltipModule} from '@angular/material/tooltip';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import moment, {Moment} from 'moment';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {DateUtility} from '../date-utility';
import {Driver} from '../driver';
import {Trip, TripReport} from '../trip';
import {TripReportComponent} from '../trip-report/trip-report.component';
import {DIALOG_CONFIG} from '../dialog-config';

interface TimeReportRow {
  key: string;
  trip: Trip;
  date: Moment;
  name: string;
  start: string;
  end: string;
  durationMinutes: number | null;
  durationLabel: string;
}

interface WeekGroup {
  weekLabel: string;
  rows: TimeReportRow[];
  totalLabel: string;
}

interface PeriodReport {
  weeks: WeekGroup[];
  totalLabel: string;
}

@Component({
  standalone: true,
  selector: 'app-time-report',
  templateUrl: './time-report.component.html',
  styleUrls: ['./time-report.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatFormFieldModule, MatIconModule, MatProgressSpinnerModule, MatSelectModule, MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeReportComponent implements OnInit {
  readonly userService = inject(UserService);
  private readonly dataStore = inject(DataStore);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);

  isAdmin$!: Observable<boolean>;
  drivers$!: Observable<Driver[]>;
  effectiveDriverKey$!: Observable<string | null>;
  report$!: Observable<PeriodReport | null>;

  selectedDriver: Driver | null = null;

  // Payroll runs in fixed 14-day periods, two ISO weeks at a time, anchored so the first week
  // of the pair is always even-numbered (e.g. the period covering today is weeks 32-33 — 32 is even).
  private readonly periodStartSubject = new BehaviorSubject<Moment>(this.periodStartFor(moment()));
  private readonly driverKeySubject = new BehaviorSubject<string | null>(null);

  ngOnInit(): void {
    this.isAdmin$ = this.userService.isAdmin$;
    this.drivers$ = this.dataStore.getAllDrivers();

    this.effectiveDriverKey$ = combineLatest([this.isAdmin$, this.userService.driverProfile$, this.driverKeySubject]).pipe(
      map(([isAdmin, driverProfile, pickedKey]) => isAdmin ? pickedKey : (driverProfile?.$key ?? null))
    );

    this.report$ = combineLatest([this.periodStartSubject, this.effectiveDriverKey$]).pipe(
      switchMap(([periodStart, driverKey]) => {
        if (!driverKey) return of(null);
        const periodEnd = periodStart.clone().add(13, 'days');
        const from = this.dateUtility.getDate(periodStart);
        const to = this.dateUtility.getDate(periodEnd);
        return combineLatest([
          this.dataStore.getTrips(from, to),
          this.dataStore.getPublicDatesInRange(periodStart, periodEnd),
        ]).pipe(
          map(([trips, publicDates]) => {
            const publicDateSet = new Set(publicDates);
            const publicTrips = trips.filter(t => publicDateSet.has(this.dateUtility.dateKey(t.start)));
            return this.buildReport(publicTrips, driverKey);
          })
        );
      })
    );
  }

  selectDriver(driver: Driver) {
    this.selectedDriver = driver;
    this.driverKeySubject.next(driver.$key);
  }

  compareDrivers(a: Driver | null, b: Driver | null): boolean {
    return a?.$key === b?.$key;
  }

  get periodStart(): Moment {
    return this.periodStartSubject.value;
  }

  get periodEnd(): Moment {
    return this.periodStartSubject.value.clone().add(13, 'days');
  }

  previousPeriod() {
    this.periodStartSubject.next(this.periodStartSubject.value.clone().subtract(14, 'days'));
  }

  nextPeriod() {
    this.periodStartSubject.next(this.periodStartSubject.value.clone().add(14, 'days'));
  }

  goToCurrentPeriod() {
    this.periodStartSubject.next(this.periodStartFor(moment()));
  }

  // Monday of the date's own ISO week, pulled back an extra week if that week is odd-numbered,
  // so the result always lands on the Monday of an even ISO week.
  private periodStartFor(date: Moment): Moment {
    const monday = date.clone().startOf('isoWeek');
    return monday.isoWeek() % 2 === 0 ? monday : monday.subtract(1, 'week');
  }

  openTripReport(trip: Trip, driverKey: string) {
    const dialogRef = this.dialog.open(TripReportComponent, DIALOG_CONFIG);
    dialogRef.componentInstance.edit(trip, (t: Trip, dKey: string, report: TripReport) => this.dataStore.updateTripReport(t, dKey, report), driverKey);
  }

  private buildReport(trips: Trip[], driverKey: string): PeriodReport {
    const rows = trips
      .filter(t => t.drivers?.includes(driverKey))
      .map(t => this.buildRow(t, driverKey))
      .sort((a, b) => a.date.valueOf() - b.date.valueOf());

    const weekMap = new Map<string, TimeReportRow[]>();
    for (const row of rows) {
      const weekKey = `${row.date.isoWeekYear()}-${row.date.isoWeek()}`;
      const weekRows = weekMap.get(weekKey);
      if (weekRows) {
        weekRows.push(row);
      } else {
        weekMap.set(weekKey, [row]);
      }
    }

    const weeks: WeekGroup[] = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, weekRows]) => {
        const totalMinutes = weekRows.reduce((sum, r) => sum + (r.durationMinutes ?? 0), 0);
        return {
          weekLabel: `Uge ${weekRows[0].date.isoWeek()}`,
          rows: weekRows,
          totalLabel: this.formatDuration(totalMinutes),
        };
      });

    const totalMinutes = rows.reduce((sum, r) => sum + (r.durationMinutes ?? 0), 0);
    return {weeks, totalLabel: this.formatDuration(totalMinutes)};
  }

  private buildRow(trip: Trip, driverKey: string): TimeReportRow {
    const report = trip.reports?.[driverKey];
    const start = report?.actualStart ?? null;
    const end = report?.actualEnd ?? null;
    const durationMinutes = (start && end && end.isAfter(start)) ? end.diff(start, 'minutes') : null;

    return {
      key: trip.$key,
      trip,
      date: trip.start,
      name: trip.name,
      start: start ? start.format('HH:mm') : '—',
      end: end ? end.format('HH:mm') : '—',
      durationMinutes,
      durationLabel: durationMinutes !== null ? this.formatDuration(durationMinutes) : '—',
    };
  }

  private formatDuration(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${m.toString().padStart(2, '0')}`;
  }
}
