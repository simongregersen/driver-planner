import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {NgbDropdown, NgbDropdownItem, NgbDropdownMenu, NgbDropdownToggle, NgbModal, NgbTooltip} from '@ng-bootstrap/ng-bootstrap';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import moment, {Moment} from 'moment';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {NgbUtility} from '../ngb-date-utility';
import {Driver} from '../driver';
import {Trip, TripReport} from '../trip';
import {TripReportComponent} from '../trip-report/trip-report.component';

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

interface MonthReport {
  weeks: WeekGroup[];
  totalLabel: string;
}

@Component({
  standalone: true,
  selector: 'app-time-report',
  templateUrl: './time-report.component.html',
  styleUrls: ['./time-report.component.css'],
  imports: [AsyncPipe, DatePipe, NgbDropdown, NgbDropdownToggle, NgbDropdownMenu, NgbDropdownItem, NgbTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeReportComponent implements OnInit {
  readonly userService = inject(UserService);
  private readonly dataStore = inject(DataStore);
  private readonly ngbUtility = inject(NgbUtility);
  private readonly modalService = inject(NgbModal);

  isAdmin$!: Observable<boolean>;
  drivers$!: Observable<Driver[]>;
  effectiveDriverKey$!: Observable<string | null>;
  report$!: Observable<MonthReport | null>;

  selectedDriver: Driver | null = null;

  private readonly monthSubject = new BehaviorSubject<Moment>(moment().startOf('month'));
  private readonly driverKeySubject = new BehaviorSubject<string | null>(null);

  ngOnInit(): void {
    this.isAdmin$ = this.userService.isAdmin$;
    this.drivers$ = this.dataStore.getAllDrivers();

    this.effectiveDriverKey$ = combineLatest([this.isAdmin$, this.userService.driverProfile$, this.driverKeySubject]).pipe(
      map(([isAdmin, driverProfile, pickedKey]) => isAdmin ? pickedKey : (driverProfile?.$key ?? null))
    );

    this.report$ = combineLatest([this.monthSubject, this.effectiveDriverKey$]).pipe(
      switchMap(([month, driverKey]) => {
        if (!driverKey) return of(null);
        const monthStart = month.clone().startOf('month');
        const monthEnd = month.clone().endOf('month');
        const from = this.ngbUtility.getDate(monthStart);
        const to = this.ngbUtility.getDate(monthEnd);
        return combineLatest([
          this.dataStore.getTrips(from, to),
          this.dataStore.getPublicDatesInRange(monthStart, monthEnd),
        ]).pipe(
          map(([trips, publicDates]) => {
            const publicDateSet = new Set(publicDates);
            const publicTrips = trips.filter(t => publicDateSet.has(this.ngbUtility.dateKey(t.start)));
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

  get selectedMonth(): Moment {
    return this.monthSubject.value;
  }

  previousMonth() {
    this.monthSubject.next(this.monthSubject.value.clone().subtract(1, 'month'));
  }

  nextMonth() {
    this.monthSubject.next(this.monthSubject.value.clone().add(1, 'month'));
  }

  goToCurrentMonth() {
    this.monthSubject.next(moment().startOf('month'));
  }

  openTripReport(trip: Trip, driverKey: string) {
    const modalRef = this.modalService.open(TripReportComponent, {size: 'lg'});
    modalRef.componentInstance.edit(trip, (t: Trip, dKey: string, report: TripReport) => this.dataStore.updateTripReport(t, dKey, report), driverKey);
  }

  private buildReport(trips: Trip[], driverKey: string): MonthReport {
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
