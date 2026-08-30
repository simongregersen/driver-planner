import {TestBed} from '@angular/core/testing';
import {MatDialog} from '@angular/material/dialog';
import {of} from 'rxjs';
import moment, {Moment} from 'moment';
import {TripsComponent} from './trips.component';
import {DataStore} from '../data.service';
import {Driver} from '../driver';
import {Trip, TripRead} from '../trip';
import {ReadReceiptsService} from '../read-receipts/read-receipts.service';

/**
 * The read-receipt half of TripsComponent: what the driver's app decides to record, and what the
 * office is shown about it.
 *
 * The two questions worth pinning here are the ones no lower layer can answer. Utility knows
 * whether a trip is unread but not whether *this* list is the one that should say so, and
 * SeenWhenVisibleDirective knows when an element has been seen but not what seeing it means.
 * Both of those joins live here.
 */
describe('TripsComponent read receipts', () => {
  const VERSION = 1700000000000;
  let recorded: [string, string, number][];
  let dismissed: [string, string[], number][];
  let confirmResult: boolean;

  function read(version: number, dismissedByOffice = false): TripRead {
    return {at: moment(version + 60_000), version, dismissed: dismissedByOffice};
  }

  function trip(overrides: Partial<Trip> = {}): Trip {
    return {
      $key: 't1',
      start: moment().add(3, 'days'),
      end: moment().add(3, 'days').add(2, 'hours'),
      name: 'Tur', drivers: ['d1'], vehicles: [], deleted: false, modified: moment(VERSION),
      ...overrides,
    };
  }

  function driver(key: string, overrides: Partial<Driver> = {}): Driver {
    return {$key: key, displayName: key.toUpperCase(), name: key, birthday: null, deleted: false, uid: `uid-${key}`, ...overrides};
  }

  beforeEach(() => {
    recorded = [];
    dismissed = [];
    confirmResult = true;
    TestBed.configureTestingModule({
      imports: [TripsComponent],
      providers: [
        {
          provide: DataStore,
          useValue: {
            getAllDrivers: () => of([driver('d1'), driver('d2')]),
            getAllVehicles: () => of([]),
            dismissTripReadWarning: (tripKey: string, driverKeys: string[], version: number) => {
              dismissed.push([tripKey, driverKeys, version]);
              return Promise.resolve();
            },
          },
        },
        {
          provide: ReadReceiptsService,
          useValue: {
            record: (tripKey: string, driverKey: string, version: number) => {
              recorded.push([tripKey, driverKey, version]);
            },
          },
        },
        {
          provide: MatDialog,
          useValue: {open: () => ({afterClosed: () => of(confirmResult)})},
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(TripsComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  describe('readToken — what the driver s app agrees to record', () => {
    it('watches a changed trip the signed-in driver has not read', () => {
      const c = create({markReadWhenSeen: true, currentDriverKey: 'd1'});

      expect(c.readToken(trip())).toBe(`t1:${VERSION}`);
    });

    // The token carries the version, not just the trip, so an edit landing while the row is
    // already sitting still on screen re-arms the observer. Nothing scrolls, so nothing else would.
    it('changes when the trip is changed again', () => {
      const c = create({markReadWhenSeen: true, currentDriverKey: 'd1'});
      const before = c.readToken(trip());

      expect(c.readToken(trip({modified: moment(VERSION + 5000)}))).not.toBe(before);
    });

    it('stops watching once this driver has read the current version', () => {
      const c = create({markReadWhenSeen: true, currentDriverKey: 'd1'});

      expect(c.readToken(trip({reads: {d1: read(VERSION)}}))).toBeNull();
    });

    // The scope rule, restated at the point of use: a trip planned before its day went public was
    // never changed, so there is nothing to acknowledge.
    it('ignores a trip that was never changed after publication', () => {
      const c = create({markReadWhenSeen: true, currentDriverKey: 'd1'});

      expect(c.readToken(trip({modified: undefined}))).toBeNull();
    });

    it('ignores a trip this driver is not assigned to', () => {
      const c = create({markReadWhenSeen: true, currentDriverKey: 'd9'});

      expect(c.readToken(trip())).toBeNull();
    });

    // Every admin list renders through this same component, so the off switch has to be the
    // default — otherwise Dagsplaner would record the admin as having read the drivers' trips.
    it('is off wherever the list is not the driver s own day', () => {
      expect(create({currentDriverKey: 'd1'}).readToken(trip())).toBeNull();
    });

    it('records the trip, driver and version when the row has been seen', () => {
      const c = create({markReadWhenSeen: true, currentDriverKey: 'd1'});

      c.onSeen(trip());

      expect(recorded).toEqual([['t1', 'd1', VERSION]]);
    });
  });

  describe('the office s unread warning', () => {
    const drivers = [driver('d1'), driver('d2')];

    it('warns while an assigned driver has not read the change', () => {
      const c = create({showReadReceipts: true});

      expect(c.hasUnreadWarning(trip(), drivers)).toBe(true);
    });

    it('says nothing once everyone has', () => {
      const c = create({showReadReceipts: true});

      expect(c.hasUnreadWarning(trip({reads: {d1: read(VERSION)}}), drivers)).toBe(false);
    });

    // An office receipt is meant to silence the warning — that is the entire point of dismissal.
    it('is silenced by an office-written receipt just as by a real one', () => {
      const c = create({showReadReceipts: true});

      expect(c.hasUnreadWarning(trip({reads: {d1: read(VERSION, true)}}), drivers)).toBe(false);
    });

    // Day Plans browses backwards as well as forwards, and an unread change on a trip that has
    // already run is exactly what the office wants to find there.
    it('still warns on a trip whose date has passed', () => {
      const c = create({showReadReceipts: true});
      const past = trip({start: moment().subtract(2, 'days'), end: moment().subtract(2, 'days').add(1, 'hour')});

      expect(c.hasUnreadWarning(past, drivers)).toBe(true);
    });

    it('is off in every list that is not Dagsplaner', () => {
      expect(create().hasUnreadWarning(trip(), drivers)).toBe(false);
    });

    it('names who is outstanding and who has already read it, and when', () => {
      const c = create({showReadReceipts: true});
      const t = trip({drivers: ['d1', 'd2'], reads: {d1: read(VERSION)}});

      const when = read(VERSION).at.format('[d.] D. MMMM [kl.] HH:mm');
      expect(c.readReceiptSummary(t, drivers)).toBe(`Set af D1 ${when}. Ikke set af D2.`);
    });

    it('leaves out the read half when nobody has read it', () => {
      const c = create({showReadReceipts: true});

      expect(c.readReceiptSummary(trip(), drivers)).toBe('Ikke set af D1.');
    });

    // Neither of these can ever produce a receipt, so the office would otherwise be left guessing
    // whether waiting longer might help. It won't — the point of the note is that this one needs
    // a phone call.
    it('explains a driver who has no app to read it in', () => {
      const c = create({showReadReceipts: true});
      const noLogin = [driver('d1', {uid: undefined})];

      expect(c.readReceiptSummary(trip(), noLogin)).toBe('Ikke set af D1 (intet login).');
    });

    it('explains a driver who has since left', () => {
      const c = create({showReadReceipts: true});
      const gone = [driver('d1', {deleted: true})];

      expect(c.readReceiptSummary(trip(), gone)).toBe('Ikke set af D1 (slettet).');
    });
  });

  describe('dismissing the warning', () => {
    const drivers = [driver('d1'), driver('d2')];

    it('records office receipts for the outstanding drivers only', () => {
      const c = create({showReadReceipts: true});
      // d1 has genuinely read it. Including them would overwrite their real timestamp, because an
      // admin write cascades past the drivers' own first-read-wins rule.
      const t = trip({drivers: ['d1', 'd2'], reads: {d1: read(VERSION)}});

      c.dismissReadWarning(t, drivers, new Event('click'));

      expect(dismissed).toEqual([['t1', ['d2'], VERSION]]);
    });

    it('does nothing when the dialog is dismissed', () => {
      confirmResult = false;
      const c = create({showReadReceipts: true});

      c.dismissReadWarning(trip(), drivers, new Event('click'));

      expect(dismissed).toEqual([]);
    });

    // The triangle sits on top of the row's own click-to-edit target.
    it('does not open the trip editor underneath it', () => {
      const c = create({showReadReceipts: true});
      const event = new Event('click');
      const stop = vi.spyOn(event, 'stopPropagation');

      c.dismissReadWarning(trip(), drivers, event);

      expect(stop).toHaveBeenCalled();
    });
  });

  describe('what the driver is told', () => {
    it('discloses that their reading was recorded', () => {
      const c = create({highlightModified: true, currentDriverKey: 'd1'});
      const t = trip({reads: {d1: read(VERSION)}});

      expect(c.modifiedLabel(t)).toContain('· Set kl.');
    });

    // The disclosure has to stay honest: an office receipt means somebody was phoned, not that the
    // driver opened anything, and claiming otherwise would be worse than saying nothing.
    it('does not claim they saw something the office waved through', () => {
      const c = create({highlightModified: true, currentDriverKey: 'd1'});
      const t = trip({reads: {d1: read(VERSION, true)}});

      expect(c.modifiedLabel(t)).not.toContain('Set');
    });

    // The "Ændret …" highlight lapses after 24 hours; a driver opening a change three days late
    // should still be told it was recorded.
    it('still shows the receipt after the change stops being highlighted', () => {
      const c = create({highlightModified: true, currentDriverKey: 'd1'});
      const old: Moment = moment().subtract(3, 'days');
      const t = trip({modified: old, reads: {d1: read(old.valueOf())}});

      expect(c.isRecentlyModified(t)).toBe(false);
      expect(c.showsModifiedFooter(t)).toBe(true);
    });
  });
  // Every other test here calls the component's methods directly, which cannot catch the template
  // failing to render what they return — the outlets, the context, the column's own @if gate.
  describe('rendering', () => {
    function render(inputs: Record<string, unknown>) {
      const fixture = TestBed.createComponent(TripsComponent);
      fixture.componentRef.setInput('trips', [trip()]);
      for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).querySelectorAll('.read-warning');
    }

    it('puts the warning in both the desktop row and the mobile card', () => {
      // Two, not one: desktop table cells and the mobile card are the same <tr>, with CSS showing
      // whichever fits. .reports-indicator beside it renders the same way.
      expect(render({showReadReceipts: true}).length).toBe(2);
    });

    it('renders nothing at all in a list that does not ask for it', () => {
      expect(render({}).length).toBe(0);
    });

    // The row's "Ændret …" tooltip opens as soon as the pointer crosses into the row, so it is
    // already showing by the time the pointer reaches an action button with a tooltip of its own.
    it('stands the row tooltip down while the pointer is over the action buttons', () => {
      const fixture = TestBed.createComponent(TripsComponent);
      fixture.componentRef.setInput('trips', [trip({modified: moment()})]);
      fixture.componentRef.setInput('highlightModified', true);
      fixture.componentRef.setInput('showFinishToggle', true);
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      const row = host.querySelector('tr.hoverable')!;
      const actions = host.querySelector('.cell-trip-actions')!;
      expect(row.classList.contains('mat-mdc-tooltip-disabled')).toBe(false);

      actions.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      expect(row.classList.contains('mat-mdc-tooltip-disabled')).toBe(true);

      actions.dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();
      expect(row.classList.contains('mat-mdc-tooltip-disabled')).toBe(false);
    });

    it('stops rendering once everyone has read the change', () => {
      const fixture = TestBed.createComponent(TripsComponent);
      fixture.componentRef.setInput('trips', [trip({reads: {d1: read(VERSION)}})]);
      fixture.componentRef.setInput('showReadReceipts', true);
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.read-warning').length).toBe(0);
    });
  });
});


/**
 * The overnight tail: a day's plan reaches DAY_PLAN_OVERNIGHT_HOURS past midnight (see
 * DataStore.getTrips), so a trip leaving at 01:00 appears at the foot of the evening it is the
 * continuation of — and again, in its own right, on the plan for the day it actually starts on.
 *
 * That double appearance is the whole hazard: the office moved to booking such trips at 23:59
 * precisely so they would land somewhere a driver would look, and a row that shows "01:00" with
 * no more said would leave exactly the same doubt about which night is meant. So what is pinned
 * here is not that the trip appears, but that the row says which day it belongs to — and that
 * the em dash for a trip whose times lie outside the day being shown does NOT swallow the times
 * this trip was pulled in to show.
 */
describe('TripsComponent overnight trips', () => {
  const DAY = moment('2026-04-15', 'YYYY-MM-DD');
  const at = (date: string, hhmm: string) => moment(`${date} ${hhmm}`, 'YYYY-MM-DD HH:mm');

  function trip(start: Moment, end: Moment | null): Trip {
    return {$key: 't1', start, end, name: 'Tur', drivers: [], vehicles: [], deleted: false};
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TripsComponent],
      providers: [
        {provide: DataStore, useValue: {getAllDrivers: () => of([]), getAllVehicles: () => of([])}},
        {provide: MatDialog, useValue: {open: () => ({afterClosed: () => of(false)})}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(t: Trip | Trip[], referenceDate: Moment | null = DAY) {
    const fixture = TestBed.createComponent(TripsComponent);
    fixture.componentRef.setInput('trips', Array.isArray(t) ? t : [t]);
    fixture.componentRef.setInput('referenceDate', referenceDate);
    fixture.detectChanges();
    return fixture;
  }

  it('marks a trip that starts after the day it is listed under', () => {
    const c = create(trip(at('2026-04-16', '01:00'), at('2026-04-16', '05:00'))).componentInstance;

    expect(c.startsAfterReference(trip(at('2026-04-16', '01:00'), null))).toBe(true);
    expect(c.overnightDateLabel(trip(at('2026-04-16', '01:00'), null))).toBe(moment(at('2026-04-16', '01:00')).format('ddd D/M'));
  });

  it('leaves an ordinary trip of this day, and a multi-day one running into it, unmarked', () => {
    const c = create(trip(at('2026-04-15', '08:00'), at('2026-04-15', '10:00'))).componentInstance;

    expect(c.startsAfterReference(trip(at('2026-04-15', '23:30'), at('2026-04-16', '02:00')))).toBe(false);
    // Started the day before and still running — the case the em dash has always been for.
    expect(c.startsAfterReference(trip(at('2026-04-14', '22:00'), at('2026-04-15', '06:00')))).toBe(false);
  });

  // The regression this pins: both cells ask "is this the day being shown?", and for an overnight
  // trip the honest answer is no — which would have drawn the em dash over both of its times.
  it('shows an overnight trip its own start and end times rather than the em dash', () => {
    const c = create(trip(at('2026-04-16', '01:00'), at('2026-04-16', '05:00'))).componentInstance;
    const t = trip(at('2026-04-16', '01:00'), at('2026-04-16', '05:00'));

    expect(c.startsOutsideReference(t)).toBe(false);
    expect(c.endsOutsideReference(t)).toBe(false);
    expect(c.mobileTimeLabel(t)).toBe('01:00–05:00');
  });

  it('still hides the times of a multi-day trip that runs out of the day being shown', () => {
    const c = create(trip(at('2026-04-14', '22:00'), at('2026-04-16', '06:00'))).componentInstance;
    const t = trip(at('2026-04-14', '22:00'), at('2026-04-16', '06:00'));

    expect(c.startsOutsideReference(t)).toBe(true);
    expect(c.endsOutsideReference(t)).toBe(true);
    expect(c.mobileTimeLabel(t)).toBe('—–—');
  });

  it('dims the row and dates it', () => {
    const host = create(trip(at('2026-04-16', '01:00'), at('2026-04-16', '05:00'))).nativeElement as HTMLElement;

    expect(host.querySelector('tr.hoverable')!.classList.contains('trip-overnight')).toBe(true);
    // One: the date belongs to the desktop Start cell. The mobile card layout — the same <tr>,
    // with CSS showing whichever fits — says it once in the group heading below instead.
    expect(host.querySelectorAll('.overnight-date').length).toBe(1);
  });

  // The mobile half of the same answer: a divider and a heading in front of the group, rather
  // than a date on every card.
  describe('the heading over the group (mobile card layout)', () => {
    function headings(trips: Trip[]): string[] {
      const host = create(trips).nativeElement as HTMLElement;
      return [...host.querySelectorAll('.overnight-heading')].map(e => e.textContent!.trim());
    }

    function tripAt(key: string, date: string, hhmm: string): Trip {
      return {...trip(at(date, hhmm), null), $key: key};
    }

    it('names the night, once, above the first trip of the tail', () => {
      const rendered = headings([
        tripAt('a', '2026-04-15', '18:00'),
        tripAt('b', '2026-04-16', '01:00'),
        tripAt('c', '2026-04-16', '02:30'),
      ]);

      expect(rendered).toEqual([`Natten til ${at('2026-04-16', '01:00').format('dddd[,] [d.] D. MMMM')}`]);
    });

    it('comes before the trip it introduces, not after it', () => {
      const host = create([tripAt('a', '2026-04-15', '18:00'), tripAt('b', '2026-04-16', '01:00')]).nativeElement as HTMLElement;
      const rows = [...host.querySelectorAll('tbody tr')];

      expect(rows.findIndex(r => r.classList.contains('overnight-heading-row')))
        .toBe(rows.findIndex(r => r.classList.contains('trip-overnight')) - 1);
    });

    it('says nothing at all on a day with no overnight trips', () => {
      expect(headings([tripAt('a', '2026-04-15', '18:00')])).toEqual([]);
    });
  });

  // A template list has no day context at all, so nothing there can be "the night after".
  it('marks nothing in a list with no reference day', () => {
    const host = create(trip(at('2026-04-16', '01:00'), null), null).nativeElement as HTMLElement;

    expect(host.querySelectorAll('.overnight-date').length).toBe(0);
    expect(host.querySelector('tr.hoverable')!.classList.contains('trip-overnight')).toBe(false);
  });
});

/**
 * A trip cancelled after its day went public (see Trip.deleted and DataStore.removeTrip). It is
 * still in the list on purpose: the whole reason it isn't simply deleted is that a driver who
 * has been told to drive somewhere has to be told when that is called off, and a row that
 * quietly disappears from their day is exactly what fails to tell them.
 *
 * So what is pinned here is that the row says cancelled — the class the red background and the
 * strike-through hang off — and that nothing else on it still treats the trip as work to be
 * organised.
 */
describe('TripsComponent cancelled trips', () => {
  function trip(overrides: Partial<Trip> = {}): Trip {
    return {
      $key: 't1', start: moment('2026-04-15 09:00', 'YYYY-MM-DD HH:mm'),
      end: moment('2026-04-15 12:00', 'YYYY-MM-DD HH:mm'),
      name: 'Tur', drivers: ['d1'], vehicles: ['v1'], deleted: false, ...overrides,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TripsComponent],
      providers: [
        {provide: DataStore, useValue: {getAllDrivers: () => of([]), getAllVehicles: () => of([])}},
        {provide: MatDialog, useValue: {open: () => ({afterClosed: () => of(false)})}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(t: Trip) {
    const fixture = TestBed.createComponent(TripsComponent);
    fixture.componentRef.setInput('trips', [t]);
    fixture.detectChanges();
    return fixture;
  }

  it('marks a cancelled row, and leaves an ordinary one unmarked', () => {
    const cancelled = create(trip({deleted: true})).nativeElement as HTMLElement;
    const ordinary = create(trip()).nativeElement as HTMLElement;

    expect(cancelled.querySelector('tr.hoverable')!.classList.contains('trip-deleted')).toBe(true);
    expect(ordinary.querySelector('tr.hoverable')!.classList.contains('trip-deleted')).toBe(false);
  });

  // Amber "nobody is assigned to this" beside a struck-through row is asking the office to staff
  // a trip that isn't happening.
  it('raises no staffing warning on a cancelled trip', () => {
    const c = create(trip({deleted: true})).componentInstance;

    expect(c.hasDriverCountMismatch(trip({deleted: true, drivers: [], vehicles: []}))).toBe(false);
    expect(c.hasVehicleCountMismatch(trip({deleted: true, drivers: ['d1'], vehicles: []}))).toBe(false);
    // Still raised on a trip that is actually going ahead — the check above is the cancellation
    // talking, not showWarnings being off.
    expect(c.hasDriverCountMismatch(trip({drivers: [], vehicles: []}))).toBe(true);
  });
});
