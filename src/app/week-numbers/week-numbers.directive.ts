import {Directive, Input, inject} from '@angular/core';
import {
  MatCalendar,
  MatCalendarCellClassFunction,
  MatCalendarCellCssClasses,
  MatDateRangePicker,
  MatDatepicker,
} from '@angular/material/datepicker';
import {Moment} from 'moment';

/**
 * Adds an ISO week-number column to a Material calendar — the inline `<mat-calendar>`, the
 * `<mat-datepicker>` popup and the `<mat-date-range-picker>` popup alike, since all three
 * render the same MatCalendar internally.
 *
 * Material has no week-number support of its own and no way to add a column: MatMonthView
 * hardcodes seven columns, MatCalendarBody derives its cell width from that count, and neither
 * template projects content. Injecting an eighth `<td>` would therefore break both the column
 * arithmetic and the grid's keyboard/ARIA semantics.
 *
 * So nothing is injected. This tags each cell with its ISO week and its column through the
 * public `dateClass` input, and week-numbers.css renders the number as a `::before` in a gutter
 * to the left of the grid. The number is drawn purely from CSS on a cell that Material rendered
 * itself, so the table stays exactly as Material built it.
 *
 * Only Dagsplaner and Periodeplan use this; the styles are inert unless the `week-numbers` class
 * this directive applies is present.
 */
@Directive({
  standalone: true,
  selector: '[appWeekNumbers]',
  // Lands on the <mat-calendar> element for an inline calendar. A popup renders its calendar in
  // an overlay instead, so there the class travels via the picker's panelClass (see below) —
  // either way it ends up on the same element the stylesheet selects on.
  host: {'[class.week-numbers]': 'true'},
})
export class WeekNumbersDirective {
  /**
   * The host's own dateClass, if it has one — this directive takes ownership of that input, so
   * pass the page's function here rather than binding `[dateClass]` alongside. Both writing to
   * `dateClass` would leave the last one to run each change-detection cycle the winner.
   *
   * A plain setter rather than a signal `input()`: MatCalendar reads `dateClass` in its
   * `ngAfterContentInit`, and inputs are assigned before that whereas an `effect()` would not
   * reliably be. Absent a binding, Angular still assigns the static attribute's `''`.
   */
  @Input()
  set appWeekNumbers(inner: MatCalendarCellClassFunction<Moment> | '' | undefined) {
    this.inner = typeof inner === 'function' ? inner : undefined;
    this.apply();
  }

  private inner?: MatCalendarCellClassFunction<Moment>;

  private readonly host =
    inject<MatCalendar<Moment>>(MatCalendar, {optional: true, self: true}) ??
    inject<MatDatepicker<Moment>>(MatDatepicker, {optional: true, self: true}) ??
    inject<MatDateRangePicker<Moment>>(MatDateRangePicker, {optional: true, self: true});

  private apply(): void {
    const host = this.host;
    if (!host) return;
    host.dateClass = composeWeekNumbers(this.inner);
    // MatCalendar has no panelClass — its own host element carries the class instead (see the
    // host binding above). Only a popup needs this, and only once; re-setting it is harmless.
    if (!(host instanceof MatCalendar)) {
      const existing = host.panelClass;
      host.panelClass = existing ? [...(typeof existing === 'string' ? [existing] : existing), 'week-numbers'] : 'week-numbers';
    }
  }
}

/**
 * The classes one month cell needs: its ISO week (which week-numbers.css turns into the visible
 * number) and its column, 1 = Monday, which tells the stylesheet how far left to shift the
 * number to reach the gutter. Every cell is tagged; the stylesheet renders a number only for the
 * first cell of each row, which is the one place the row's week can be read off unambiguously —
 * including the first row, whose leading days belong to the previous month and so aren't
 * rendered at all.
 *
 * Both the column index and moment's `isoWeekday` count from Monday, which is also where the
 * calendar's own week starts, since app.config.ts pins the `da` locale.
 */
export function weekNumberClasses(date: Moment): Record<string, boolean> {
  return {[`week-${date.isoWeek()}`]: true, [`week-col-${date.isoWeekday()}`]: true};
}

/** Wraps a page's own dateClass so its classes survive alongside the week-number ones. */
export function composeWeekNumbers(inner?: MatCalendarCellClassFunction<Moment>): MatCalendarCellClassFunction<Moment> {
  return (date, view) => {
    const own = inner ? inner(date, view) : '';
    // Weeks only exist in the month grid; the year and multi-year views have no rows to label.
    return view === 'month' ? {...toClassMap(own), ...weekNumberClasses(date)} : own;
  };
}

// dateClass may return any of Angular's four class shapes; normalising to a map is what lets the
// week classes be merged in without having to care which one a caller picked.
function toClassMap(classes: MatCalendarCellCssClasses): Record<string, boolean> {
  if (!classes) return {};
  if (typeof classes === 'string') {
    return Object.fromEntries(classes.split(/\s+/).filter(Boolean).map(c => [c, true]));
  }
  if (Array.isArray(classes) || classes instanceof Set) {
    return Object.fromEntries([...classes].map(c => [c, true]));
  }
  return Object.fromEntries(Object.entries(classes).map(([name, on]) => [name, !!on]));
}
