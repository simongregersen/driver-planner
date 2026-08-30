import {ChangeDetectionStrategy, Component, computed, inject, input} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {combineLatest, Observable} from 'rxjs';
import {map, switchMap} from 'rxjs/operators';
import {Moment} from 'moment';
import {DataStore} from '../data.service';
import {DateUtility} from '../date-utility';
import {Trip} from '../trip';
import {ClockRecord} from '../clock-record';
import {ClockRecordFormComponent} from '../clock-record-form/clock-record-form.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';
import {RichTextComponent} from '../rich-text/rich-text.component';
import {
  clockRecordTotals,
  formatDogn,
  formatDuration,
  PayPeriod,
  payPeriodFrom,
  recordDognCount,
  recordHasError,
  recordMinutes,
} from '../pay-period';

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
  dognbetaling: boolean;
  dognCount: number;
}

interface DayReport {
  date: Moment;
  trips: DayTrip[];
  records: DayRecord[];
  totalMinutes: number;
  totalLabel: string;
  dognCount: number;
}

interface WeekGroup {
  weekNumber: number;
  days: DayReport[];
  totalLabel: string;
  dognCount: number;
}

interface PeriodReport {
  weeks: WeekGroup[];
  totalLabel: string;
  dognCount: number;
}

/**
 * One driver's timesheet for one pay period, day by day — what a driver sees on Timeseddel, and
 * (unchanged) what an admin sees after clicking a cell in the overview table there.
 *
 * Presentational in the sense that the caller decides *which* driver and *which* period; the
 * fetching and the arithmetic are this component's own, because both places want exactly the
 * same ones. The arithmetic itself lives in pay-period.ts rather than here, so the overview's
 * single-figure cell and this day-by-day breakdown cannot drift apart — see that file's header.
 */
@Component({
  standalone: true,
  selector: 'app-pay-period-report',
  templateUrl: './pay-period-report.component.html',
  styleUrls: ['./pay-period-report.component.css'],
  imports: [DatePipe, MatButtonModule, MatIconModule, MatTooltipModule, RichTextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayPeriodReportComponent {
  driverKey = input.required<string>();
  /** The Monday the period starts on — already anchored by the caller (see payPeriodStartFor). */
  periodStart = input.required<Moment>();

  private readonly dataStore = inject(DataStore);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);

  private readonly period = computed(() => payPeriodFrom(this.periodStart()));

  readonly report = toSignal(
    combineLatest([toObservable(this.driverKey), toObservable(this.period)]).pipe(
      switchMap(([driverKey, period]) => combineLatest([
        this.dataStore.getTrips(period.start, period.end),
        this.dataStore.getClockRecords(driverKey, period.start, period.end),
        this.dataStore.getPublicDatesInRange(period.start, period.end),
      ]).pipe(
        map(([trips, records, publicDates]) => {
          const publicDateSet = new Set(publicDates);
          const publicTrips = trips.filter(t => t.drivers?.includes(driverKey) && publicDateSet.has(this.dateUtility.dateKey(t.start)));
          return this.buildReport(publicTrips, records, period);
        })
      )),
    ) as Observable<PeriodReport | null>,
    {initialValue: null},
  );

  editClockRecord(record: ClockRecord) {
    const instance = this.dialog.open(ClockRecordFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.mode = 'edit';
    instance.driverKey = this.driverKey();
    instance.record = record;
  }

  addClockRecord(date: Moment) {
    const instance = this.dialog.open(ClockRecordFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.driverKey = this.driverKey();
    instance.initialClockIn = date;
  }

  private buildReport(trips: Trip[], records: ClockRecord[], period: PayPeriod): PeriodReport {
    // Every day of the period is shown, even ones with nothing reported yet — the day heading's
    // "+" button (see the template) needs somewhere to attach to for adding a first record on
    // an otherwise-empty day.
    const days = this.dateUtility.range(period.start, period.end)
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
        const dognCount = weekDays.reduce((sum, d) => sum + d.dognCount, 0);
        return {
          weekNumber: weekDays[0].date.isoWeek(),
          days: weekDays,
          totalLabel: formatDuration(totalMinutes),
          dognCount,
        };
      });

    const totalMinutes = days.reduce((sum, d) => sum + d.totalMinutes, 0);
    const dognCount = days.reduce((sum, d) => sum + d.dognCount, 0);
    return {weeks, totalLabel: formatDuration(totalMinutes), dognCount};
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
        const hasError = recordHasError(record);
        const durationMinutes = recordMinutes(record);
        const dognbetaling = !!record.dognbetaling;
        const dognCount = recordDognCount(record);
        return {
          record,
          durationMinutes,
          durationLabel: hasError ? 'Fejl' : (record.clockOut ? (dognbetaling ? formatDogn(dognCount) : formatDuration(durationMinutes)) : '—'),
          hasError,
          crossesDay: !!(record.clockOut && !this.dateUtility.equals(record.clockIn, record.clockOut)),
          dognbetaling,
          dognCount,
        };
      });

    // Through clockRecordTotals rather than summed here, so this breakdown and the admin
    // overview's single figure for the same period are the same arithmetic — including the rule
    // that a døgnbetaling record is counted as whole days and kept out of the hourly total.
    const {minutes, dognCount} = clockRecordTotals(dayRecords.map(r => r.record));
    return {date, trips: dayTrips, records: dayRecords, totalMinutes: minutes, totalLabel: formatDuration(minutes), dognCount};
  }
}
