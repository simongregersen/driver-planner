import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Trip} from '../trip';
import {DataStore} from '../data.service';
import {NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {Observable} from 'rxjs';

@Component({
  standalone: false,
  selector: 'app-trips',
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.css']
})
export class TripsComponent implements OnInit {
  @Input() trips: Trip[] = [];
  @Output() edit = new EventEmitter<Trip>();
  @Output() remove = new EventEmitter<Trip>();

  drivers$!: Observable<Driver[]>;
  vehicles$!: Observable<Vehicle[]>;

  constructor(public dataStore: DataStore) {
  }

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

  trackByFn(index: number, item: Trip) {
    return item.$key;
  }
}
