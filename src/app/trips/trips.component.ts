import {ChangeDetectionStrategy, Component, inject, input, OnInit, output} from '@angular/core';
import {AsyncPipe, DatePipe} from '@angular/common';
import {NgbTooltip} from '@ng-bootstrap/ng-bootstrap';
import {ConfirmationPopoverModule} from 'angular-confirmation-popover';
import {Trip} from '../trip';
import {DataStore} from '../data.service';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-trips',
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.css'],
  imports: [AsyncPipe, DatePipe, NgbTooltip, ConfirmationPopoverModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripsComponent implements OnInit {
  trips = input<Trip[]>([]);
  readonly = input(false);
  edit = output<Trip>();
  remove = output<Trip>();

  readonly dataStore = inject(DataStore);

  drivers$!: Observable<Driver[]>;
  vehicles$!: Observable<Vehicle[]>;

  ngOnInit(): void {
    this.drivers$ = this.dataStore.getAllDrivers();
    this.vehicles$ = this.dataStore.getAllVehicles();
  }

  getDriver(drivers: Driver[] | null, key: string): Driver | undefined {
    return drivers?.find(d => d.$key === key);
  }

  getVehicle(vehicles: Vehicle[] | null, key: string): Vehicle | undefined {
    return vehicles?.find(v => v.$key === key);
  }
}
