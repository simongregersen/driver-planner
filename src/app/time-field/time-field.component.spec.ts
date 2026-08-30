import {TestBed} from '@angular/core/testing';
import {MatDialog} from '@angular/material/dialog';
import {EMPTY} from 'rxjs';
import moment from 'moment';
import {TimeFieldComponent} from './time-field.component';
import {BreakpointService} from '../breakpoint.service';

describe('TimeFieldComponent', () => {
  const timeAt = (hhmm: string) => moment(`1970-01-01 ${hhmm}`, 'YYYY-MM-DD HH:mm');
  let isMobile: boolean;

  beforeEach(() => {
    isMobile = false;
    TestBed.configureTestingModule({
      imports: [TimeFieldComponent],
      providers: [
        {provide: BreakpointService, useValue: {isMobile: () => isMobile}},
        {provide: MatDialog, useValue: {open: () => ({afterClosed: () => EMPTY})}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(TimeFieldComponent);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture;
  }

  describe('fallbackTime', () => {
    it('seeds the field on first open when it has no value of its own', () => {
      const fixture = create({fallbackTime: timeAt('09:00')});
      fixture.componentInstance.onFieldPointerDown();
      expect(fixture.componentInstance.materialTimeControl.value?.format('HH:mm')).toBe('09:00');
    });

    // Not every open starts with a pointer — a click synthesised by the keyboard has no
    // pointerdown in front of it, so the click path still seeds too.
    it('still seeds from a click on its own', () => {
      const fixture = create({fallbackTime: timeAt('09:00')});
      fixture.componentInstance.onFieldClick();
      expect(fixture.componentInstance.materialTimeControl.value?.format('HH:mm')).toBe('09:00');
    });

    it('leaves an existing value alone', () => {
      const fixture = create({fallbackTime: timeAt('09:00')});
      fixture.componentInstance.writeValue(timeAt('14:30'));
      fixture.componentInstance.onFieldClick();
      expect(fixture.componentInstance.materialTimeControl.value?.format('HH:mm')).toBe('14:30');
    });
  });

  describe('defaultsToNow', () => {
    // pointerdown, not click: mat-timepicker's input won't re-render a value set while it has
    // focus, and the click that seeds is the same one that focuses it and opens the dropdown.
    it('seeds the field with the current time before the click that opens the picker', () => {
      const fixture = create({defaultsToNow: true});

      fixture.componentInstance.onFieldPointerDown();

      const seeded = fixture.componentInstance.materialTimeControl.value!;
      expect(Math.abs(seeded.diff(moment(), 'minutes'))).toBeLessThanOrEqual(3);
    });

    // The desktop dropdown scrolls to the option matching the value exactly, and to the top of
    // the list when none does, so an unrounded seed would leave it sitting on 00:00.
    it('rounds the seeded time to a whole minuteStep, which the pickers can land on', () => {
      const fixture = create({defaultsToNow: true, minuteStep: 15});

      fixture.componentInstance.onFieldPointerDown();

      expect(fixture.componentInstance.materialTimeControl.value!.minutes() % 15).toBe(0);
      expect(fixture.componentInstance.materialTimeControl.value!.seconds()).toBe(0);
    });

    it('leaves an existing value alone', () => {
      const fixture = create({defaultsToNow: true});
      fixture.componentInstance.writeValue(timeAt('14:30'));

      fixture.componentInstance.onFieldPointerDown();
      fixture.componentInstance.onFieldClick();

      expect(fixture.componentInstance.materialTimeControl.value?.format('HH:mm')).toBe('14:30');
    });

    it('wins over a fallbackTime, which is the stale answer once both are given', () => {
      const fixture = create({defaultsToNow: true, fallbackTime: timeAt('09:00')});

      fixture.componentInstance.onFieldPointerDown();

      expect(fixture.componentInstance.materialTimeControl.value?.format('HH:mm')).not.toBe('09:00');
    });
  });

  describe('clear', () => {
    it('empties the field and notifies the host', () => {
      const fixture = create({clearable: true, fallbackTime: timeAt('09:00')});
      const c = fixture.componentInstance;
      const cleared: number[] = [];
      c.cleared.subscribe(() => cleared.push(1));
      c.writeValue(timeAt('12:00'));

      c.clear(new MouseEvent('click'));

      expect(c.materialTimeControl.value).toBeNull();
      expect(c.displayValue()).toBe('');
      expect(cleared).toHaveLength(1);
    });

    it('stops the click reaching the field, so the fallback cannot immediately re-seed it', () => {
      // The clear button sits inside the mat-form-field whose own (click) runs onFieldClick —
      // without stopPropagation the value would be restored from fallbackTime the instant it was
      // cleared, and on mobile the picker would reopen too.
      const fixture = create({clearable: true, fallbackTime: timeAt('09:00')});
      const c = fixture.componentInstance;
      c.writeValue(timeAt('12:00'));

      const event = new MouseEvent('click', {bubbles: true, cancelable: true});
      const stopPropagation = vi.spyOn(event, 'stopPropagation');
      c.clear(event);

      expect(stopPropagation).toHaveBeenCalled();
      expect(c.materialTimeControl.value).toBeNull();
    });

    it('propagates the cleared value to a registered form control', () => {
      const fixture = create({clearable: true});
      const c = fixture.componentInstance;
      const written: (moment.Moment | null)[] = [];
      c.registerOnChange(v => written.push(v));
      c.writeValue(timeAt('12:00'));

      c.clear(new MouseEvent('click'));

      expect(written.at(-1)).toBeNull();
    });
  });
});
