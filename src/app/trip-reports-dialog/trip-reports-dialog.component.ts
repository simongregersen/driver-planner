import {ChangeDetectionStrategy, Component, OnInit, inject} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {Trip, TripReport} from '../trip';
import {DataStore} from '../data.service';
import {TripReportFormComponent} from '../trip-report-form/trip-report-form.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';

interface ReportRow {
  driverKey: string;
  driverName: string;
  report: TripReport;
}

// Admin-facing list of every driver's report for one trip (Dagsplaner's reports-column icon,
// shown only when a trip has at least one) — the pen icon on a row reopens
// TripReportFormComponent for that specific driver, same form the driver themselves would see,
// letting an admin correct it.
//
// Opened via MatDialog.open() with no data binding — `trip` is set directly on componentInstance
// by the caller straight after open(); that assignment happens before Angular runs ngOnInit
// (dialog creation defers it), so ngOnInit sees the final value.
@Component({
  standalone: true,
  selector: 'app-trip-reports-dialog',
  templateUrl: './trip-reports-dialog.component.html',
  styleUrls: ['./trip-reports-dialog.component.css'],
  imports: [AsyncPipe, DatePipe, MatButtonModule, MatDialogModule, MatIconModule, MatTooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripReportsDialogComponent implements OnInit {
  trip!: Trip;

  private readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);
  readonly dialogRef = inject(MatDialogRef<TripReportsDialogComponent>);

  rows$!: Observable<ReportRow[]>;

  ngOnInit(): void {
    const reports = this.trip.reports ?? {};
    this.rows$ = this.dataStore.getAllDrivers().pipe(
      map(drivers => Object.entries(reports).map(([driverKey, report]) => ({
        driverKey,
        driverName: drivers.find(d => d.$key === driverKey)?.displayName ?? 'Ukendt chauffør',
        report,
      })))
    );
  }

  // Nothing on a report is mandatory (see TripReportFormComponent), so either half of a pair
  // needed for these can be missing.
  durationLabel(report: TripReport): string | null {
    if (!report.start || !report.end) return null;
    const totalMinutes = report.end.diff(report.start, 'minutes');
    if (totalMinutes < 0) return null;
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    const parts = days > 0 ? [`${days} d`] : [];
    parts.push(`${hours} h`, `${minutes} min`);
    return parts.join(' ');
  }

  distanceLabel(report: TripReport): number | null {
    if (report.startKm == null || report.endKm == null) return null;
    return report.endKm - report.startKm;
  }

  editReport(driverKey: string): void {
    const instance = this.dialog.open(TripReportFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.trip = this.trip;
    instance.driverKey = driverKey;
  }
}
