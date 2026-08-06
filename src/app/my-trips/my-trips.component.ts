import {Component, OnInit} from '@angular/core';
import {NgbCalendar, NgbDateStruct} from '@ng-bootstrap/ng-bootstrap';
import {Observable} from 'rxjs';
import {Trip} from '../trip';
import {Driver} from '../driver';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {AuthenticationService} from '../authentication.service';
import {Utility} from '../utility';
import {NgbUtility} from '../ngb-date-utility';

@Component({
  standalone: false,
  selector: 'app-my-trips',
  templateUrl: './my-trips.component.html',
  styleUrls: ['./my-trips.component.css']
})
export class MyTripsComponent implements OnInit {
  trips$!: Observable<Trip[]>;
  private _selectedDate!: NgbDateStruct;

  constructor(public dataStore: DataStore, public userService: UserService, public ngbUtility: NgbUtility,
              private authService: AuthenticationService, private calendar: NgbCalendar) {
  }

  ngOnInit(): void {
    this.userService.driverProfile$.subscribe(driver => {
      if (driver?.deleted) {
        this.authService.logout();
      }
    });

    this.selectedDate = this.calendar.getToday();
  }

  filterMyTrips(trips: Trip[] | null, driver: Driver | null): Trip[] {
    if (!trips || !driver) return [];
    return trips.filter(t => Utility.isAssigned(driver, t));
  }

  set selectedDate(date: NgbDateStruct) {
    this._selectedDate = date;
    this.trips$ = this.dataStore.getTrips(date);
  }

  get selectedDate(): NgbDateStruct {
    return this._selectedDate;
  }

}
