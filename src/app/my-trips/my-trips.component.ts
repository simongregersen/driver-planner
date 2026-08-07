import {ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {AsyncPipe, DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {NgbCalendar, NgbDate, NgbDatepicker, NgbInputDatepicker, NgbDateStruct, NgbModal} from '@ng-bootstrap/ng-bootstrap';
import {Observable} from 'rxjs';
import {Trip, TripReport} from '../trip';
import {Driver} from '../driver';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {AuthenticationService} from '../authentication.service';
import {Utility} from '../utility';
import {NgbUtility} from '../ngb-date-utility';
import {TripsComponent} from '../trips/trips.component';
import {TripReportComponent} from '../trip-report/trip-report.component';

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
  private readonly modalService = inject(NgbModal);

  trips$!: Observable<Trip[]>;
  dayPublic$!: Observable<boolean>;
  publicDates$!: Observable<string[]>;
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
    this.publicDates$ = this.dataStore.getPublicDates();
  }

  isPublicDate(date: NgbDateStruct, publicDates: string[]): boolean {
    return publicDates.includes(this.ngbUtility.dateKey(this.ngbUtility.toMoment(date)!));
  }

  previousDay() {
    this.selectedDate = this.calendar.getPrev(NgbDate.from(this.selectedDate)!, 'd');
  }

  nextDay() {
    this.selectedDate = this.calendar.getNext(NgbDate.from(this.selectedDate)!, 'd');
  }

  goToToday() {
    this.selectedDate = this.calendar.getToday();
  }

  filterMyTrips(trips: Trip[] | null, driver: Driver | null): Trip[] {
    if (!trips || !driver) return [];
    return trips.filter(t => Utility.isAssigned(driver, t));
  }

  openTripReport(trip: Trip, driverKey: string) {
    const modalRef = this.modalService.open(TripReportComponent, {size: 'lg'});
    modalRef.componentInstance.edit(trip, (t: Trip, dKey: string, report: TripReport) => this.dataStore.updateTripReport(t, dKey, report), driverKey);
  }

  set selectedDate(date: NgbDateStruct) {
    this._selectedDate = date;
    this.trips$ = this.dataStore.getTrips(date);
    this.dayPublic$ = this.dataStore.getDayPublic(date);
  }

  get selectedDate(): NgbDateStruct {
    return this._selectedDate;
  }

}
