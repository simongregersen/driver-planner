import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import moment, {Moment} from 'moment';
import {MyTripsComponent} from './my-trips.component';
import {DataStore} from '../data.service';
import {UserService} from '../user.service';
import {AuthenticationService} from '../authentication.service';
import {BreakpointService} from '../breakpoint.service';
import {PageHeaderService} from '../page-header.service';
import {Driver} from '../driver';
import {Trip} from '../trip';

/**
 * Min dag reaches a few hours past midnight (see DAY_PLAN_OVERNIGHT_HOURS), and those hours are
 * the next day — a day with its own "Synlig" flag, which the whole page is gated on precisely
 * because an unpublished day is one the office is still moving trips around on.
 *
 * So the join pinned here is the one neither layer can make on its own: DataStore hands back
 * everything in the window and knows nothing about publication, and the trip list renders what
 * it is given. Only this component knows that a trip past midnight has to clear tomorrow's gate
 * before a driver is allowed to see it as theirs.
 */
describe('MyTripsComponent overnight trips', () => {
  const DAY = moment('2026-04-15', 'YYYY-MM-DD');
  const at = (date: string, hhmm: string) => moment(`${date} ${hhmm}`, 'YYYY-MM-DD HH:mm');

  const driver: Driver = {
    $key: 'd1', displayName: 'Kim', name: 'Kim', birthday: null, deleted: false, external: false, uid: 'uid-d1',
  };

  function trip(key: string, start: Moment): Trip {
    return {$key: key, start, end: start.clone().add(2, 'hours'), name: 'Tur', drivers: ['d1'], vehicles: [], deleted: false};
  }

  const TODAY_TRIP = trip('today', at('2026-04-15', '18:00'));
  const OVERNIGHT_TRIP = trip('overnight', at('2026-04-16', '01:00'));

  function create(publicDates: string[]) {
    TestBed.configureTestingModule({
      imports: [MyTripsComponent],
      providers: [
        {
          provide: DataStore,
          useValue: {
            getTrips: () => of([TODAY_TRIP, OVERNIGHT_TRIP]),
            getDayPublic: () => of(true),
            getAllNotes: () => of([]),
            getPublicDates: () => of(publicDates),
            // Only reached because the render below instantiates the real TripsComponent.
            getAllDrivers: () => of([driver]),
            getAllVehicles: () => of([]),
          },
        },
        {provide: UserService, useValue: {driverProfile$: of(driver)}},
        {provide: AuthenticationService, useValue: {logout: () => undefined}},
        {provide: BreakpointService, useValue: {isMobile: () => false}},
        {provide: PageHeaderService, useValue: {set: () => undefined}},
      ],
    });
    const fixture = TestBed.createComponent(MyTripsComponent);
    fixture.componentInstance.selectedDate.set(DAY);
    // The trip list hangs off toObservable(selectedDate), which is effect-backed: nothing is
    // fetched at all until a change-detection pass runs the effect.
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('shows a trip from after midnight once the day it belongs to is published', () => {
    const c = create(['2026-04-15', '2026-04-16']);

    expect(c.filteredTrips().map(t => t.$key)).toEqual(['today', 'overnight']);
  });

  // The regression this pins: today being published says nothing about tomorrow. Left ungated,
  // a driver would be shown a 01:00 trip out of a day nobody has published yet — and could be
  // told it was theirs right up until the moment it was given to someone else.
  it('holds it back while that day is still unpublished, without touching this day s own trips', () => {
    const c = create(['2026-04-15']);

    expect(c.filteredTrips().map(t => t.$key)).toEqual(['today']);
  });
});
