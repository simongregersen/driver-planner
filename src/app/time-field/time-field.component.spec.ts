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
