import {ChangeDetectionStrategy, Component, inject, input} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import moment from 'moment';
import {map, switchMap} from 'rxjs/operators';
import {DataStore} from '../data.service';
import {ClockRecord} from '../clock-record';
import {ClockRecordCreatorComponent} from '../clock-record-creator/clock-record-creator.component';
import {ClockRecordStopComponent} from '../clock-record-stop/clock-record-stop.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';

// A driver can be clocked in across a shift that started a few days ago (a multi-day trip),
// so this has to look back further than "today" to find a still-open record — but an
// unbounded query would be wasteful, so it's capped at a week.
const OPEN_RECORD_LOOKBACK_DAYS = 7;

@Component({
  standalone: true,
  selector: 'app-clock-punch',
  templateUrl: './clock-punch.component.html',
  styleUrls: ['./clock-punch.component.css'],
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClockPunchComponent {
  driverKey = input.required<string>();

  private readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);

  readonly openRecord = toSignal(
    toObservable(this.driverKey).pipe(
      switchMap(driverKey => this.dataStore.getClockRecords(driverKey, moment().subtract(OPEN_RECORD_LOOKBACK_DAYS, 'days'))),
      map(records => records.find(r => !r.clockOut) ?? null),
    ),
    {initialValue: null as ClockRecord | null},
  );

  punch(): void {
    const openRecord = this.openRecord();
    if (openRecord) {
      this.openStopDialog(openRecord);
    } else {
      this.openStartDialog();
    }
  }

  private openStartDialog(): void {
    const dialogRef = this.dialog.open(ClockRecordCreatorComponent, SMALL_DIALOG_CONFIG);
    dialogRef.componentInstance.open((clockIn, note) => {
      this.dataStore.addClockRecord(this.driverKey(), clockIn, note);
    });
  }

  private openStopDialog(record: ClockRecord): void {
    const dialogRef = this.dialog.open(ClockRecordStopComponent, SMALL_DIALOG_CONFIG);
    dialogRef.componentInstance.open(
      record,
      (r, updates) => this.dataStore.updateClockRecord(this.driverKey(), r, updates),
      (r) => this.dataStore.removeClockRecord(this.driverKey(), r),
    );
  }
}
