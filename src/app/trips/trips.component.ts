import {ChangeDetectionStrategy, Component, inject, input, OnInit, output} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Trip, TripReport} from '../trip';
import {DataStore} from '../data.service';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import moment, {Moment} from 'moment';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {SMALL_DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-trips',
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripsComponent implements OnInit {
  trips = input<Trip[]>([]);
  readonly = input(false);
  highlightModified = input(false);
  hideDescriptionOnScreen = input(false);
  rowClickToEdit = input(false);
  reportable = input(false);
  currentDriverKey = input<string | null>(null);
  edit = output<Trip>();
  remove = output<Trip>();
  report = output<Trip>();

  readonly dataStore = inject(DataStore);
  private readonly dialog = inject(MatDialog);

  viewModel$!: Observable<{drivers: Driver[]; vehicles: Vehicle[]}>;

  ngOnInit(): void {
    this.viewModel$ = combineLatest([this.dataStore.getAllDrivers(), this.dataStore.getAllVehicles()]).pipe(
      map(([drivers, vehicles]) => ({drivers, vehicles}))
    );
  }

  getDriver(drivers: Driver[] | null, key: string): Driver | undefined {
    return drivers?.find(d => d.$key === key);
  }

  getVehicle(vehicles: Vehicle[] | null, key: string): Vehicle | undefined {
    return vehicles?.find(v => v.$key === key);
  }

  isRecentlyModified(trip: Trip): boolean {
    return this.highlightModified() && !!trip.modified && trip.modified.isAfter(moment().subtract(24, 'hours'));
  }

  // Both columns iterate the same driver-key order, so a given line index always refers to
  // the same driver in the Start and Slut columns — even if that driver has only one side reported.
  // Raw Moments are returned, not pre-formatted strings — the template formats them, same as
  // it already does for the scheduled trip.start/trip.end times.
  startReportEntries(trip: Trip): {key: string; time: Moment | null}[] {
    return this.reportKeys(trip).map(key => ({key, time: trip.reports![key].actualStart ?? null}));
  }

  endReportEntries(trip: Trip): {key: string; end: Moment | null; garage: Moment | null}[] {
    return this.reportKeys(trip).map(key => {
      const r = trip.reports![key];
      return {key, end: r.actualEnd ?? null, garage: r.garageReturn ?? null};
    });
  }

  private reportKeys(trip: Trip): string[] {
    if (!trip.reports) return [];
    const currentDriverKey = this.currentDriverKey();
    return Object.keys(trip.reports).filter(key => !currentDriverKey || key === currentDriverKey);
  }

  onRowClick(trip: Trip): void {
    if (!this.readonly() && this.rowClickToEdit()) {
      this.edit.emit(trip);
    } else if (this.reportable()) {
      this.report.emit(trip);
    }
  }

  confirmRemove(trip: Trip) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...SMALL_DIALOG_CONFIG,
      data: {
        message: `Er du sikker på, at du vil slette turen\n'${trip.name}'?`,
        confirmLabel: 'Slet',
        danger: true,
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) this.remove.emit(trip);
    });
  }

  // Tapping an unset field logs "now"; tapping an already-logged one clears it again, so the
  // same button both sets and undoes a mistaken tap. Both write the whole reports/{driverKey}
  // node, so the other two fields have to be read back and preserved here.
  toggleLog(trip: Trip, driverKey: string, field: keyof TripReport) {
    const existing = trip.reports?.[driverKey] ?? {};
    const isSet = !!existing[field];
    this.dataStore.updateTripReport(trip, driverKey, {...existing, [field]: isSet ? null : moment()});
  }

  hasReport(trip: Trip, driverKey: string, field: keyof TripReport): boolean {
    return !!trip.reports?.[driverKey]?.[field];
  }

  quickLogTooltip(trip: Trip, driverKey: string, field: keyof TripReport, label: string): string {
    const value = trip.reports?.[driverKey]?.[field];
    return value ? `${label}: ${value.format('HH:mm')}` : label;
  }

  // Same ordering rules as the report dialog's own validation, applied to whatever's
  // already been quick-logged for this driver.
  quickLogError(trip: Trip, driverKey: string): string | null {
    const report = trip.reports?.[driverKey];
    if (!report) return null;

    const start = report.actualStart ?? null;
    const garage = report.garageReturn ?? null;
    const end = report.actualEnd ?? null;

    if (start && garage && garage.isBefore(start)) {
      return '"Retur til garage" kan ikke være før "startet".';
    }
    if (start && end && end.isBefore(start)) {
      return '"Afsluttet" kan ikke være før "startet".';
    }
    if (garage && end && end.isBefore(garage)) {
      return '"Afsluttet" kan ikke være før "retur til garage".';
    }
    return null;
  }
}
