import {ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {NgbCalendar, NgbDatepicker, NgbInputDatepicker, NgbDateStruct} from '@ng-bootstrap/ng-bootstrap';
import {Observable} from 'rxjs';
import {Trip} from '../trip';
import {Driver} from '../driver';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {AuthenticationService} from '../authentication.service';
import {Utility} from '../utility';
import {NgbUtility} from '../ngb-date-utility';
import {TripsComponent} from '../trips/trips.component';

@Component({
  standalone: true,
  selector: 'app-my-trips',
  templateUrl: './my-trips.component.html',
  styleUrls: ['./my-trips.component.css'],
  imports: [FormsModule, AsyncPipe, DatePipe, NgbDatepicker, NgbInputDatepicker, TripsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyTripsComponent implements OnInit {
  readonly dataStore = inject(DataStore);
  readonly userService = inject(UserService);
  readonly ngbUtility = inject(NgbUtility);
  private readonly authService = inject(AuthenticationService);
  private readonly calendar = inject(NgbCalendar);
  private readonly destroyRef = inject(DestroyRef);

  trips$!: Observable<Trip[]>;
  readonly minDate = this.ngbUtility.minDate(5);
  private _selectedDate!: NgbDateStruct;

  ngOnInit(): void {
    this.userService.driverProfile$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(driver => {
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
