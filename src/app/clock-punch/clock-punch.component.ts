import {ChangeDetectionStrategy, Component, inject, input} from '@angular/core';
import {toObservable, toSignal} from '@angular/core/rxjs-interop';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import moment from 'moment';
import {map, switchMap} from 'rxjs/operators';
import {CLOCK_RECORD_LOOKBACK_DAYS, DataStore} from '../data.service';
import {ClockRecord} from '../clock-record';
import {ClockRecordFormComponent} from '../clock-record-form/clock-record-form.component';
import {ClockRecordStopComponent} from '../clock-record-stop/clock-record-stop.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';

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
      switchMap(driverKey => this.dataStore.getClockRecords(driverKey, moment().subtract(CLOCK_RECORD_LOOKBACK_DAYS, 'days'))),
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
    const instance = this.dialog.open(ClockRecordFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.driverKey = this.driverKey();
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
