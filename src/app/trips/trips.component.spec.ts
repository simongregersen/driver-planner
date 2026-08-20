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
      name: 'Tur', drivers: ['d1'], vehicles: [], modified: moment(VERSION),
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

    it('stops rendering once everyone has read the change', () => {
      const fixture = TestBed.createComponent(TripsComponent);
      fixture.componentRef.setInput('trips', [trip({reads: {d1: read(VERSION)}})]);
      fixture.componentRef.setInput('showReadReceipts', true);
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.read-warning').length).toBe(0);
    });
  });
});
