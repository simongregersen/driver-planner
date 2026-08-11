import {ChangeDetectionStrategy, Component, inject, input, OnInit, output} from '@angular/core';
import {AsyncPipe, DatePipe, NgTemplateOutlet} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatChipsModule} from '@angular/material/chips';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Trip} from '../trip';
import {DataStore} from '../data.service';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {FinishedTripsService} from '../finished-trips.service';
import {combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import moment from 'moment';
import {RichTextComponent} from '../rich-text/rich-text.component';

@Component({
  standalone: true,
  selector: 'app-trips',
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.css'],
  imports: [
    AsyncPipe, DatePipe, NgTemplateOutlet,
    MatButtonModule, MatChipsModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule,
    RichTextComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripsComponent implements OnInit {
  trips = input<Trip[]>([]);
  readonly = input(false);
  highlightModified = input(false);
  hideDescriptionOnScreen = input(false);
  hideSingleDriver = input(false);
  showFinishToggle = input(false);
  edit = output<Trip>();
  removeDriver = output<{trip: Trip; driverKey: string}>();
  removeVehicle = output<{trip: Trip; vehicleKey: string}>();

  readonly dataStore = inject(DataStore);
  private readonly finishedTrips = inject(FinishedTripsService);

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

  // Row click is the only way to edit now — there's no separate edit/delete button.
  onRowClick(trip: Trip): void {
    if (!this.readonly()) {
      this.edit.emit(trip);
    }
  }

  isFinished(trip: Trip): boolean {
    return this.showFinishToggle() && this.finishedTrips.isFinished(trip.$key);
  }

  // Purely local/on-device state (see FinishedTripsService) — stopPropagation so this never
  // triggers the row's own click-to-edit handler.
  toggleFinished(trip: Trip, event: Event): void {
    event.stopPropagation();
    this.finishedTrips.toggle(trip.$key);
  }
}
