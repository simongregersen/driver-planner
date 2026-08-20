import {Component, viewChild} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {MatCalendar, MatCalendarCellClassFunction, MatDateRangePicker, MatDatepicker, MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import moment, {Moment} from 'moment';
import {WeekNumbersDirective, composeWeekNumbers, weekNumberClasses} from './week-numbers.directive';
import {readFileSync} from 'node:fs';

describe('weekNumberClasses', () => {
  function classesOf(date: string): string[] {
    return Object.keys(weekNumberClasses(moment(date))).sort();
  }

  it('tags a date with its ISO week and its Monday-based column', () => {
    // A Thursday in week 34.
    expect(classesOf('2026-08-20')).toEqual(['week-34', 'week-col-4']);
  });

  it('puts Monday in column 1 and Sunday in column 7', () => {
    expect(classesOf('2026-08-17')).toContain('week-col-1');
    expect(classesOf('2026-08-23')).toContain('week-col-7');
  });

  // The two cases a naive "week = ceil(dayOfYear / 7)" gets wrong, and the reason this leans on
  // moment's isoWeek rather than computing the number here.
  it('numbers a year that ends in week 53', () => {
    expect(classesOf('2026-12-28')).toContain('week-53');
  });

  it('gives late-December days belonging to the next year week 1', () => {
    expect(classesOf('2025-12-29')).toContain('week-1');
  });
});

describe('composeWeekNumbers', () => {
  const pastDay: MatCalendarCellClassFunction<Moment> = () => 'past-day';

  it('keeps the wrapped function\'s own classes alongside the week ones', () => {
    const classes = composeWeekNumbers(pastDay)(moment('2026-08-20'), 'month');
    expect(classes).toEqual({'past-day': true, 'week-34': true, 'week-col-4': true});
  });

  it('works without a wrapped function', () => {
    expect(composeWeekNumbers()(moment('2026-08-20'), 'month')).toEqual({'week-34': true, 'week-col-4': true});
  });

  // The year and multi-year views show months and years, not days — a week number on those cells
  // would be meaningless, and the pass-through keeps the host's own classes working there.
  it('adds nothing outside the month view', () => {
    expect(composeWeekNumbers(pastDay)(moment('2026-08-20'), 'year')).toBe('past-day');
    expect(composeWeekNumbers(pastDay)(moment('2026-08-20'), 'multi-year')).toBe('past-day');
  });

  it('splits a space-separated class string rather than treating it as one class', () => {
    const classes = composeWeekNumbers(() => 'past-day public-day')(moment('2026-08-20'), 'month');
    expect(classes).toEqual({'past-day': true, 'public-day': true, 'week-34': true, 'week-col-4': true});
  });
});

@Component({
  standalone: true,
  imports: [MatDatepickerModule, WeekNumbersDirective],
  template: `<mat-calendar [startAt]="startAt" [appWeekNumbers]="dateClass"></mat-calendar>`,
})
class HostComponent {
  readonly calendar = viewChild.required<MatCalendar<Moment>>(MatCalendar);
  startAt = moment('2026-08-17');
  dateClass: MatCalendarCellClassFunction<Moment> = date => date.date() === 3 ? 'past-day' : '';
}

// Mirrors week-numbers.css. The stylesheet can only draw a number where these match, so the
// tests below stand in for the rendering the test environment can't do: they pin the DOM contract
// the CSS is written against.
const ROW_LEADER = 'mat-month-view td[data-mat-col="0"] > .mat-calendar-body-cell';
const GUTTER_HEADING = 'mat-month-view .mat-calendar-table-header tr:first-child th:first-child';

describe('WeekNumbersDirective on an inline calendar', () => {
  afterEach(() => TestBed.resetTestingModule());

  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  // Reading the classes off the rendered grid rather than off the function is the point of this
  // one: it is what proves the directive's dateClass actually reaches the cells, which binding
  // [dateClass] alongside it would silently undo.
  function rowLeaderClasses(fixture: ReturnType<typeof render>): string[][] {
    const leaders = fixture.nativeElement.querySelectorAll(ROW_LEADER);
    return Array.from(leaders, (cell: Element) => Array.from(cell.classList).filter(c => c.startsWith('week-')).sort());
  }

  it('labels every row of August 2026 with its ISO week', () => {
    // August 2026 starts on a Saturday, so the first row holds only the 1st and the 2nd and its
    // leading cell is the 1st in column 6 — the case a Monday-only rule would leave unlabelled.
    expect(rowLeaderClasses(render())).toEqual([
      ['week-31', 'week-col-6'],
      ['week-32', 'week-col-1'],
      ['week-33', 'week-col-1'],
      ['week-34', 'week-col-1'],
      ['week-35', 'week-col-1'],
      ['week-36', 'week-col-1'],
    ]);
  });

  it('marks the calendar so the stylesheet applies', () => {
    expect(fixtureCalendar(render()).classList).toContain('week-numbers');
  });

  it('leaves the host component\'s own dateClass working', () => {
    const cells = fixtureCalendar(render()).querySelectorAll('.past-day');
    expect(cells.length).toBe(1);
    expect(cells[0].textContent?.trim()).toBe('3');
  });

  // The "Uge" heading is drawn on a single cell of the weekday header row. Both other header
  // rows in a calendar — the month view's own divider row and the one the year/multi-year views
  // render — would match a looser selector and print the heading again, outside the gutter.
  it('has exactly one cell to hang the gutter heading on', () => {
    const matches = fixtureCalendar(render()).querySelectorAll(GUTTER_HEADING);
    expect(matches.length).toBe(1);
    expect(matches[0].classList).not.toContain('mat-calendar-table-header-divider');
  });

  it('matches nothing outside the month view', () => {
    const fixture = render();
    fixture.componentInstance.calendar().currentView = 'multi-year';
    fixture.detectChanges();
    const calendar = fixtureCalendar(fixture);
    expect(calendar.querySelector('mat-month-view')).toBeNull();
    expect(calendar.querySelectorAll(ROW_LEADER).length).toBe(0);
    expect(calendar.querySelectorAll(GUTTER_HEADING).length).toBe(0);
  });

  function fixtureCalendar(fixture: ReturnType<typeof render>): HTMLElement {
    return fixture.nativeElement.querySelector('mat-calendar');
  }
});

@Component({
  standalone: true,
  imports: [MatDatepickerModule, MatFormFieldModule, MatInputModule, WeekNumbersDirective],
  template: `
    <input [matDatepicker]="single">
    <mat-datepicker #single appWeekNumbers [startAt]="startAt"></mat-datepicker>

    <mat-form-field>
      <mat-date-range-input [rangePicker]="range">
        <input matStartDate>
        <input matEndDate>
      </mat-date-range-input>
      <mat-date-range-picker #range appWeekNumbers [startAt]="startAt"></mat-date-range-picker>
    </mat-form-field>
  `,
})
class PopupHostComponent {
  readonly startAt = moment('2026-08-17');
  readonly single = viewChild.required<MatDatepicker<Moment>>('single');
  readonly range = viewChild.required<MatDateRangePicker<Moment>>('range');
}

// A popup renders its calendar into a CDK overlay rather than into the host's own DOM, so the
// class the stylesheet keys off has to travel there via the picker's panelClass instead of via
// the directive's host binding — a second, separate path worth proving end to end.
describe('WeekNumbersDirective on a popup', () => {
  afterEach(() => TestBed.resetTestingModule());

  function open(which: 'single' | 'range') {
    const fixture = TestBed.createComponent(PopupHostComponent);
    fixture.detectChanges();
    const picker = which === 'single' ? fixture.componentInstance.single() : fixture.componentInstance.range();
    picker.open();
    fixture.detectChanges();
    const calendar = document.querySelector<HTMLElement>('.mat-datepicker-content mat-calendar');
    return {fixture, picker, calendar};
  }

  for (const which of ['single', 'range'] as const) {
    it(`marks the overlay calendar of a ${which} picker and labels its rows`, () => {
      const {picker, calendar} = open(which);
      try {
        expect(calendar?.classList).toContain('week-numbers');
        const leaders = calendar!.querySelectorAll(ROW_LEADER);
        expect(Array.from(leaders, c => Array.from(c.classList).find(n => /^week-\d+$/.test(n))))
          .toEqual(['week-31', 'week-32', 'week-33', 'week-34', 'week-35', 'week-36']);
      } finally {
        picker.close();
      }
    });
  }
});

// Layout is the one thing the test environment can't check, so this checks the stylesheet's text
// instead — for the single mistake that broke range selection in Periodeplan once already.
describe('week-numbers.css', () => {
  // Read off disk rather than imported: the build pipeline hands a processed stylesheet object to
  // an `import`, and it is the raw text this needs. Vitest runs from the workspace root.
  const weekNumbersCss = readFileSync('src/app/week-numbers/week-numbers.css', 'utf8');

  it('leaves the day button\'s pseudo-elements to Material', () => {
    // Material paints the range-selection band with .mat-calendar-body-cell::before and ::after.
    // A week number placed on either is overwritten by a stray band as soon as its row falls
    // inside a selected range; it belongs on the surrounding <td>, which Material leaves alone.
    expect(weekNumbersCss).not.toMatch(/\.mat-calendar-body-cell::(before|after)/);
  });

  it('renders the number outside anything clickable', () => {
    expect(weekNumbersCss).toContain('pointer-events: none;');
  });

  it('has a content rule for every ISO week a year can have', () => {
    const weeks = [...weekNumbersCss.matchAll(/\.week-(\d+)\)::before \{ content: '(\d+)'/g)];
    expect(weeks.map(m => Number(m[1]))).toEqual(Array.from({length: 53}, (_, i) => i + 1));
    // A mismatch here would silently label rows with the wrong week.
    expect(weeks.every(m => m[1] === m[2])).toBe(true);
  });
});
