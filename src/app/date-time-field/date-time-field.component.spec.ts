import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {MatDialog} from '@angular/material/dialog';
import {EMPTY} from 'rxjs';
import moment, {Moment} from 'moment';
import {DateTimeFieldComponent} from './date-time-field.component';
import {TimeFieldComponent} from '../time-field/time-field.component';
import {BreakpointService} from '../breakpoint.service';

/**
 * The two halves of this field are only half-independent: either one, picked on its own, fills
 * the other from the fallback. That join is what these cover — a Slut that seeds itself with the
 * current date *and* time from one tap on the time half, and a clear that has to survive that
 * same seeding rule firing on its way out.
 */
describe('DateTimeFieldComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DateTimeFieldComponent],
      providers: [
        {provide: BreakpointService, useValue: {isMobile: () => false}},
        {provide: MatDialog, useValue: {open: () => ({afterClosed: () => EMPTY})}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(DateTimeFieldComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    const emitted: (Moment | null)[] = [];
    fixture.componentInstance.valueChange.subscribe(v => emitted.push(v));
    fixture.detectChanges();
    const timeField = fixture.debugElement.query(By.directive(TimeFieldComponent)).componentInstance as TimeFieldComponent;
    return {fixture, emitted, timeField};
  }

  describe('defaultsToNow', () => {
    // Chaufførrapport's Slut: left blank while the trip is still running, so one tap has to
    // produce a whole timestamp rather than a time with no date under it.
    it('fills both halves from the current date and time on the first tap', () => {
      const {fixture, emitted, timeField} = create({defaultsToNow: true});

      timeField.onFieldPointerDown();

      const value = emitted.at(-1)!;
      expect(value.isSame(moment(), 'day')).toBe(true);
      expect(Math.abs(value.diff(moment(), 'minutes'))).toBeLessThanOrEqual(3);
      expect(fixture.componentInstance.materialDateControl.value?.isSame(moment(), 'day')).toBe(true);
    });

    it('leaves a value that is already there alone', () => {
      const existing = moment('2026-03-01 08:30', 'YYYY-MM-DD HH:mm');
      const {emitted, timeField} = create({defaultsToNow: true, value: existing});

      timeField.onFieldPointerDown();

      expect(emitted).toHaveLength(0);
    });
  });

  describe('clearing', () => {
    // The regression this pins: TimeFieldComponent empties its own control first, which lands as
    // "date set, time missing" — exactly the shape emit() fills back in from the fallback. Without
    // onCleared emptying both halves afterwards, the clear undoes itself.
    it('empties both halves and reports no value', () => {
      const {fixture, emitted, timeField} = create({
        defaultsToNow: true, clearable: true, value: moment('2026-03-01 08:30', 'YYYY-MM-DD HH:mm'),
      });

      timeField.clear(new MouseEvent('click'));

      expect(emitted.at(-1)).toBeNull();
      expect(fixture.componentInstance.materialDateControl.value).toBeNull();
      expect(fixture.componentInstance.materialTimeControl.value).toBeNull();
      expect(timeField.displayValue()).toBe('');
    });
  });
});
