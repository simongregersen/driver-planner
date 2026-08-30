import {ChangeDetectionStrategy, Component, inject, signal} from '@angular/core';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {Moment} from 'moment';
import {DataStore} from '../data.service';
import {WriteFeedbackService} from '../write-feedback.service';
import {guardDialogDismissal} from '../dialog-dismiss-guard';
import {PayPeriodReportComponent} from '../pay-period-report/pay-period-report.component';
import {PayPeriod} from '../pay-period';

// One driver's timesheet for one pay period, as opened from a cell in the admin's overview
// table on Timeseddel — the same day-by-day view the driver sees, with the same add/edit
// actions, plus the period's "Udbetalt" mark.
//
// Opened via MatDialog.open() with no data binding — driverKey/driverName/period/paid are set
// directly on componentInstance by the caller straight after open(); that assignment happens
// before Angular renders the dialog, so the template never sees them unset.
@Component({
  standalone: true,
  selector: 'app-pay-period-dialog',
  templateUrl: './pay-period-dialog.component.html',
  styleUrls: ['./pay-period-dialog.component.css'],
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule, PayPeriodReportComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PayPeriodDialogComponent {
  driverKey!: string;
  driverName!: string;
  period!: PayPeriod;
  /** The period's current Udbetalt state, so the toggle renders correctly on open. Kept as a
   * signal from there on: this dialog writes the mark itself rather than reporting it back, and
   * the table behind it is on a live listener that picks the change up on its own. */
  readonly paid = signal(false);

  private readonly dataStore = inject(DataStore);
  private readonly writeFeedback = inject(WriteFeedbackService);
  readonly dialogRef = inject(MatDialogRef<PayPeriodDialogComponent>);

  // Opened with DIALOG_CONFIG, which sets disableClose so editor dialogs can guard unsaved
  // input — this one holds none of its own (the toggle and the clock-record edits inside it each
  // write immediately), so it closes straight away. Without this call, disableClose would make it
  // un-dismissable by Escape or a backdrop click.
  constructor() {
    guardDialogDismissal(this.dialogRef, () => false);
  }

  get periodStart(): Moment {
    return this.period.start;
  }

  togglePaid(): void {
    const next = !this.paid();
    this.paid.set(next);
    void this.writeFeedback.run(this.dataStore.setPeriodPaid(this.driverKey, this.period.key, next), {
      failureMessage: 'Kunne ikke gemme udbetalt-markeringen. Prøv igen.',
    }).then(outcome => {
      // Put the toggle back if the write was rejected outright; a queued offline write is left
      // showing its new state, since it is still expected to land.
      if (outcome === 'failed') this.paid.set(!next);
    });
  }
}
