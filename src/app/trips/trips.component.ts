import {ChangeDetectionStrategy, Component, inject, input, OnInit, output} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Trip} from '../trip';
import {DataStore} from '../data.service';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import moment from 'moment';

@Component({
  standalone: true,
  selector: 'app-trips',
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.css'],
  imports: [
    AsyncPipe, DatePipe,
    MatButtonModule, MatIconModule, MatMenuModule, MatProgressSpinnerModule, MatTooltipModule,
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
  startReportEntries(trip: Trip): {key: string; time: string}[] {
    return this.reportKeys(trip).map(key => {
      const r = trip.reports![key];
      return {key, time: r.actualStart ? r.actualStart.format('HH:mm') : '—'};
    });
  }

  endReportEntries(trip: Trip): {key: string; time: string}[] {
    return this.reportKeys(trip).map(key => {
      const r = trip.reports![key];
      const time = r.actualEnd ? r.actualEnd.format('HH:mm') + (r.garageReturn ? ` (${r.garageReturn.format('HH:mm')})` : '') : '—';
      return {key, time};
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
}
