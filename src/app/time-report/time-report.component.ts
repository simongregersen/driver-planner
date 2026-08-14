import {ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed, toSignal} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import moment, {Moment} from 'moment';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {DateUtility} from '../date-utility';
import {Driver} from '../driver';
import {Trip} from '../trip';
import {ClockRecord} from '../clock-record';
import {ClockRecordFormComponent} from '../clock-record-form/clock-record-form.component';
import {ChipFilterComponent} from '../chip-filter/chip-filter.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';
import {RichTextComponent} from '../rich-text/rich-text.component';
import {PageHeaderService} from '../page-header.service';

interface DayTrip {
  key: string;
  name: string;
  start: Moment;
  end: Moment | null;
}

interface DayRecord {
  record: ClockRecord;
  durationMinutes: number;
  durationLabel: string;
  hasError: boolean;
  crossesDay: boolean;
}

interface DayReport {
  date: Moment;
  trips: DayTrip[];
  records: DayRecord[];
  totalMinutes: number;
  totalLabel: string;
}

interface WeekGroup {
  weekNumber: number;
  days: DayReport[];
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
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, ChipFilterComponent,
    RichTextComponent,
  ],
  providers: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeReportComponent implements OnInit {
  readonly userService = inject(UserService);
  private readonly dataStore = inject(DataStore);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);
  private readonly pageHeader = inject(PageHeaderService);
  private readonly datePipe = inject(DatePipe);
  private readonly destroyRef = inject(DestroyRef);

  isAdmin$!: Observable<boolean>;
  effectiveDriverKey$!: Observable<string | null>;
  effectiveDriverName$!: Observable<string | null>;
  report$!: Observable<PeriodReport | null>;

  selectedDriver: Driver | null = null;

  private readonly driverList = toSignal(this.dataStore.getAllDrivers(), {initialValue: [] as Driver[]});
  readonly driverOptions = computed(() => this.driverList().map(d => ({id: d.$key, name: d.displayName})));

  // Payroll runs in fixed 14-day periods, two ISO weeks at a time, anchored so the first week
  // of the pair is always even-numbered (e.g. the period covering today is weeks 32-33 — 32 is even).
  private readonly periodStartSubject = new BehaviorSubject<Moment>(this.periodStartFor(moment()));
  private readonly driverKeySubject = new BehaviorSubject<string | null>(null);

  ngOnInit(): void {
    this.periodStartSubject.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.updateHeader());

    this.isAdmin$ = this.userService.isAdmin$;

    this.effectiveDriverKey$ = combineLatest([this.isAdmin$, this.userService.driverProfile$, this.driverKeySubject]).pipe(
      map(([isAdmin, driverProfile, pickedKey]) => isAdmin ? pickedKey : (driverProfile?.$key ?? null))
    );

    this.effectiveDriverName$ = this.effectiveDriverKey$.pipe(
      map(key => this.driverList().find(d => d.$key === key)?.displayName ?? null)
    );

    this.report$ = combineLatest([this.periodStartSubject, this.effectiveDriverKey$]).pipe(
      switchMap(([periodStart, driverKey]) => {
        if (!driverKey) return of(null);
        const periodEnd = periodStart.clone().add(13, 'days');
        const from = this.dateUtility.getDate(periodStart);
        const to = this.dateUtility.getDate(periodEnd);
        return combineLatest([
          this.dataStore.getTrips(from, to),
          this.dataStore.getClockRecords(driverKey, from, to),
          this.dataStore.getPublicDatesInRange(periodStart, periodEnd),
        ]).pipe(
          map(([trips, records, publicDates]) => {
            const publicDateSet = new Set(publicDates);
            const publicTrips = trips.filter(t => t.drivers?.includes(driverKey) && publicDateSet.has(this.dateUtility.dateKey(t.start)));
            return this.buildReport(publicTrips, records, periodStart, periodEnd);
          })
        );
      })
    );
  }

  onDriverSelectionChange(ids: string[]): void {
    const key = ids[0] ?? null;
    this.selectedDriver = this.driverList().find(d => d.$key === key) ?? null;
    this.driverKeySubject.next(key);
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

  isCurrentPeriod(): boolean {
    return this.periodStart.isSame(this.periodStartFor(moment()), 'day');
  }

  // Monday of the date's own ISO week, pulled back an extra week if that week is odd-numbered,
  // so the result always lands on the Monday of an even ISO week.
  private periodStartFor(date: Moment): Moment {
    const monday = date.clone().startOf('isoWeek');
    return monday.isoWeek() % 2 === 0 ? monday : monday.subtract(1, 'week');
  }

  private updateHeader(): void {
    const from = this.datePipe.transform(this.periodStart.toDate(), 'd. MMM');
    const to = this.datePipe.transform(this.periodEnd.toDate(), 'd. MMM y');
    this.pageHeader.set('Timeseddel', `${from} – ${to}`);
  }

  editClockRecord(record: ClockRecord, driverKey: string) {
    const instance = this.dialog.open(ClockRecordFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.driverKey = driverKey;
    instance.record = record;
  }

  addClockRecord(date: Moment, driverKey: string) {
    const instance = this.dialog.open(ClockRecordFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.driverKey = driverKey;
    instance.initialClockIn = date;
  }

  private buildReport(trips: Trip[], records: ClockRecord[], periodStart: Moment, periodEnd: Moment): PeriodReport {
    // Every day of the period is shown, even ones with nothing reported yet — the day heading's
    // "+" button (see the template) needs somewhere to attach to for adding a first record on
    // an otherwise-empty day.
    const days = this.dateUtility.range(periodStart, periodEnd)
      .map(date => this.buildDay(date, trips, records));

    const weekMap = new Map<string, DayReport[]>();
    for (const day of days) {
      const weekKey = `${day.date.isoWeekYear()}-${day.date.isoWeek()}`;
      const weekDays = weekMap.get(weekKey);
      if (weekDays) {
        weekDays.push(day);
      } else {
        weekMap.set(weekKey, [day]);
      }
    }

    const weeks: WeekGroup[] = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, weekDays]) => {
        const totalMinutes = weekDays.reduce((sum, d) => sum + d.totalMinutes, 0);
        return {
          weekNumber: weekDays[0].date.isoWeek(),
          days: weekDays,
          totalLabel: this.formatDuration(totalMinutes),
        };
      });

    const totalMinutes = days.reduce((sum, d) => sum + d.totalMinutes, 0);
    return {weeks, totalLabel: this.formatDuration(totalMinutes)};
  }

  // Records are bucketed by their clock-in date — a record that runs past midnight (a
  // multi-day trip) is attached to the day it started, not the day it ended.
  private buildDay(date: Moment, trips: Trip[], records: ClockRecord[]): DayReport {
    const dayTrips: DayTrip[] = trips
      .filter(t => this.dateUtility.equals(t.start, date))
      .map(t => ({key: t.$key, name: t.name, start: t.start, end: t.end}));

    const dayRecords: DayRecord[] = records
      .filter(r => this.dateUtility.equals(r.clockIn, date))
      .map(record => {
        const hasError = !!(record.clockOut && record.clockOut.isBefore(record.clockIn));
        const durationMinutes = (record.clockOut && record.clockOut.isAfter(record.clockIn))
          ? record.clockOut.diff(record.clockIn, 'minutes') : 0;
        return {
          record,
          durationMinutes,
          durationLabel: hasError ? 'Fejl' : (record.clockOut ? this.formatDuration(durationMinutes) : '—'),
          hasError,
          crossesDay: !!(record.clockOut && !this.dateUtility.equals(record.clockIn, record.clockOut)),
        };
      });

    const totalMinutes = dayRecords.reduce((sum, r) => sum + r.durationMinutes, 0);
    return {date, trips: dayTrips, records: dayRecords, totalMinutes, totalLabel: this.formatDuration(totalMinutes)};
  }

  private formatDuration(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}:${m.toString().padStart(2, '0')}`;
  }
}
