import {ChangeDetectionStrategy, Component, computed, inject, input, signal} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {combineLatest, Observable} from 'rxjs';
import {switchMap} from 'rxjs/operators';
import moment, {Moment} from 'moment';
import {ClockRecord} from '../clock-record';
import {DataStore} from '../data.service';
import {DateUtility} from '../date-utility';
import {ClockRecordEditorComponent} from '../clock-record-editor/clock-record-editor.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';

// Purely presentational: no punch/start-stop logic lives here — that's ClockPunchComponent.
// This just lists whatever window of records the caller asks for and lets the driver correct one.
@Component({
  standalone: true,
  selector: 'app-time-reporting',
  templateUrl: './time-reporting.component.html',
  styleUrls: ['./time-reporting.component.css'],
  imports: [DatePipe, MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeReportingComponent {
  driverKey = input.required<string>();
  from = input.required<Moment>();
  to = input<Moment | undefined>(undefined);
  limit = input<number | undefined>(undefined);

  private readonly dataStore = inject(DataStore);
  private readonly dateUtility = inject(DateUtility);
  private readonly dialog = inject(MatDialog);

  private readonly rawRecords = toSignal(
    combineLatest([toObservable(this.driverKey), toObservable(this.from), toObservable(this.to)]).pipe(
      switchMap(([driverKey, from, to]) => this.dataStore.getClockRecords(driverKey, from, to)),
    ) as Observable<ClockRecord[] | null>,
    {initialValue: null},
  );

  readonly showRecentWeek = signal(false);

  readonly loading = computed(() => this.rawRecords() === null);
  readonly sortedRecords = computed(() =>
    [...(this.rawRecords() ?? [])].sort((a, b) => b.clockIn.valueOf() - a.clockIn.valueOf())
  );

  readonly visibleRecords = computed(() => {
    const all = this.sortedRecords();
    if (this.showRecentWeek()) {
      const cutoff = moment().subtract(7, 'days');
      return all.filter(r => r.clockIn.isAfter(cutoff));
    }
    const limit = this.limit();
    return limit ? all.slice(0, limit) : all;
  });

  // Once expanded, stays capped at the last 7 days rather than the whole (potentially much
  // longer) window the caller fetches — "see more" isn't "see everything".
  readonly hasMore = computed(() => {
    const limit = this.limit();
    return !!limit && !this.showRecentWeek() && this.sortedRecords().length > limit;
  });

  showRecentWeekRecords(): void {
    this.showRecentWeek.set(true);
  }

  collapseRecords(): void {
    this.showRecentWeek.set(false);
  }

  sameDay(a: Moment, b: Moment): boolean {
    return this.dateUtility.equals(a, b);
  }

  // Records are sorted newest-first, so a "new date" boundary is a row whose date differs
  // from the row above it (not below) — used to draw a divider between each date's records.
  isDateBoundary(index: number): boolean {
    if (index === 0) return false;
    const records = this.visibleRecords();
    return !this.sameDay(records[index].clockIn, records[index - 1].clockIn);
  }

  editRecord(record: ClockRecord) {
    const dialogRef = this.dialog.open(ClockRecordEditorComponent, SMALL_DIALOG_CONFIG);
    dialogRef.componentInstance.edit(
      record,
      (r, updates) => this.dataStore.updateClockRecord(this.driverKey(), r, updates),
      (r) => this.dataStore.removeClockRecord(this.driverKey(), r),
    );
  }
}
