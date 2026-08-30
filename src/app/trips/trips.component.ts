import {ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal} from '@angular/core';
import {AsyncPipe, DatePipe, NgTemplateOutlet} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatChipsModule} from '@angular/material/chips';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Trip, TripRead} from '../trip';
import {DataStore} from '../data.service';
import {Driver} from '../driver';
import {Vehicle} from '../vehicle';
import {FinishedTripsService} from '../finished-trips.service';
import {AssignmentConflicts, Utility} from '../utility';
import {combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import moment, {Moment} from 'moment';
import {RichTextComponent} from '../rich-text/rich-text.component';
import {TripReportFormComponent} from '../trip-report-form/trip-report-form.component';
import {TripReportsDialogComponent} from '../trip-reports-dialog/trip-reports-dialog.component';
import {ConfirmDialogComponent, ConfirmDialogData} from '../confirm-dialog/confirm-dialog.component';
import {CONFIRM_DIALOG_CONFIG, SMALL_DIALOG_CONFIG} from '../dialog-config';
import {WriteFeedbackService} from '../write-feedback.service';
import {ReadReceiptsService} from '../read-receipts/read-receipts.service';
import {SeenWhenVisibleDirective} from '../read-receipts/seen-when-visible.directive';

@Component({
  standalone: true,
  selector: 'app-trips',
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.css'],
  imports: [
    AsyncPipe, DatePipe, NgTemplateOutlet,
    MatButtonModule, MatChipsModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule,
    RichTextComponent, SeenWhenVisibleDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TripsComponent implements OnInit {
  trips = input<Trip[]>([]);
  readonly = input(false);
  highlightModified = input(false);
  hideDescriptionOnScreen = input(false);
  showOfficeNotes = input(false);
  showLabels = input(false);
  hideSingleDriver = input(false);
  /** Min dag's mobile card layout only (see the .mobile-chips-line branch in the .html) — a
   * driver-vehicle pairing (Trip.vehicleAssignments) would otherwise show up twice there: once as
   * the driver chip's "· vehicle" sub-label, and again as that same vehicle's own separate chip.
   * When on, a paired driver+vehicle render as one split chip instead (see #combinedChips), and
   * the vehicle is dropped from the standalone vehicle chips. Off elsewhere (Dagsplaner,
   * Periodeplaner, Skabeloner, and Min dag's own desktop table columns) — those already show
   * drivers/vehicles in two structurally separate places (a column each, or two chip-sets with
   * real room to breathe), where the sub-label isn't redundant the same way. */
  combineAssignedChips = input(false);
  showFinishToggle = input(false);
  /** Min dag, driver-facing: shows a small report-icon-button letting the signed-in driver
   * (currentDriverKey) add or edit their own report for this trip — see TripReportFormComponent.
   * Far from every trip needs one, so this is deliberately understated rather than a full
   * button. */
  showReportButton = input(false);
  /** The driver viewing this list — required for showReportButton, to know which of a trip's
   * (possibly several, one per assigned driver) reports belongs to them. */
  currentDriverKey = input<string | null>(null);
  /** Dagsplaner, admin-facing: shows a small icon — only when a trip actually has at least one
   * report — opening a list of every driver's report for that trip (TripReportsDialogComponent),
   * editable from there. */
  showReportsColumn = input(false);
  /** Dagsplaner, admin-facing: a warning on any trip whose latest change at least one assigned
   * driver has not seen yet (see Utility.hasUnreadWarning). Nothing is shown once everyone has —
   * this exists to be driven to zero, not to be a permanent column.
   *   Bound by the caller to the *day's* published state rather than switched on wholesale: a
   * driver cannot open an unpublished day at all, so an unread warning there would only ever mean
   * "not published yet", which the Synlig toggle already says. */
  showReadReceipts = input(false);
  /** Min dag, driver-facing: turns a row that has genuinely been on the signed-in driver's screen
   * (currentDriverKey, ~1s, app in the foreground) into a read receipt, and shows them the "Set …"
   * it recorded. Deliberately not an acknowledge button — a button is a thing people learn to tap
   * without reading. */
  markReadWhenSeen = input(false);
  /** The single day this list is being shown under, if any (a day-plans/period-plans day-block,
   * my-trips' selected day, ...) — lets a multi-day trip's start time be marked with an asterisk
   * and a fuller tooltip on the days it didn't actually start on, and an overnight trip from the
   * following morning be dimmed and dated (see startsAfterReference). Templates/other callers
   * with no such day context simply leave this unset, and no trip ever gets marked. */
  referenceDate = input<Moment | null>(null);
  /** Precomputed by the caller (Day Plans/Period Plans) off its own full, pre-filter trip list —
   * see Utility.computeAssignmentWarnings. Must NOT be derived from `trips()` itself, since
   * that's already narrowed by whatever chip/day filters the caller applies, which would make a
   * conflict inconsistently appear or disappear depending on the current filter.
   *   Left unset (null) wherever double-booking isn't the reader's problem to solve: Skabeloner,
   * whose trips aren't real calendar bookings at all, and Min dag, which is a driver's own day
   * rather than a planning view — a driver can't resolve a clash between two trips, only the
   * planner can, so surfacing one there is noise. Unset also skips the O(n²) comparison. */
  assignmentWarnings = input<Map<string, AssignmentConflicts> | null>(null);
  /** Off wherever the trip list isn't a planning view. Skabeloner: a template trip's drivers/
   * vehicles are placeholders, not a real assignment, so neither the count-mismatch nor the
   * overlap-conflict highlighting means anything there. Min dag: a driver seeing their own day
   * can't act on either warning — filling a staffing gap or resolving a clash is the planner's
   * job — so both read as unexplained amber rather than as information. */
  showWarnings = input(true);
  /** Whether "Ingen ture." should be centred in the visible page rather than sitting on its own
   * under the header — see .empty-state-centered in styles.css. For pages where this list is the
   * whole content (Min dag, Dagsplaner); deliberately off for Periodeplaner and Skabeloner,
   * where several of these lists stack down one page and a centred one would be nonsense. */
  centerEmptyState = input(false);
  edit = output<Trip>();
  removeDriver = output<{trip: Trip; driverKey: string}>();
  removeVehicle = output<{trip: Trip; vehicleKey: string}>();

  readonly dataStore = inject(DataStore);
  private readonly finishedTrips = inject(FinishedTripsService);
  private readonly dialog = inject(MatDialog);
  private readonly writeFeedback = inject(WriteFeedbackService);
  private readonly readReceipts = inject(ReadReceiptsService);

  viewModel$!: Observable<{drivers: Driver[]; vehicles: Vehicle[]}>;

  ngOnInit(): void {
    this.viewModel$ = combineLatest([this.dataStore.getAllDrivers(), this.dataStore.getAllVehicles()]).pipe(
      map(([drivers, vehicles]) => ({drivers, vehicles}))
    );
  }

  getDriver(drivers: Driver[] | null, key: string): Driver | undefined {
    return drivers?.find(d => d.$key === key);
  }

  /** A driver who has since left, still assigned to this trip. DataStore.getAllDrivers no longer
   * filters these out (it can't — the name still has to render here), so the chip is dimmed to
   * distinguish "no longer employed" from an ordinary assignment. */
  isDeletedDriver(drivers: Driver[] | null, key: string): boolean {
    return !!this.getDriver(drivers, key)?.deleted;
  }

  getVehicle(vehicles: Vehicle[] | null, key: string): Vehicle | undefined {
    return vehicles?.find(v => v.$key === key);
  }

  /** The vehicle a given driver has been paired with on this trip (see Trip.vehicleAssignments),
   * resolved to a display name — null when that driver has no pairing yet (the common case for
   * older trips and for trips still being planned) or the paired vehicle can't be resolved. */
  assignedVehicleName(trip: Trip, driverKey: string, vehicles: Vehicle[] | null): string | null {
    const vehicleKey = trip.vehicleAssignments?.[driverKey];
    return vehicleKey ? (this.getVehicle(vehicles, vehicleKey)?.displayName ?? null) : null;
  }

  /** combineAssignedChips's driver list — same hideSingleDriver suppression #driverChips itself
   * applies (see its own applyHideSingle check), kept as its own method here because
   * standaloneVehicleKeys below needs to know exactly which drivers actually rendered a chip, not
   * just trip.drivers as a whole. */
  private combinedChipDriverKeys(trip: Trip): string[] {
    return (this.hideSingleDriver() && trip.drivers.length <= 1) ? [] : trip.drivers;
  }

  /** combineAssignedChips's own driver list, exposed to the template. */
  combinedDriverKeys(trip: Trip): string[] {
    return this.combinedChipDriverKeys(trip);
  }

  /** combineAssignedChips's vehicle list — every vehicle NOT already implied by one of the
   * drivers actually shown above (see combinedChipDriverKeys): a vehicle a driver is paired with
   * appears once, folded into that driver's own split chip, not a second time as its own chip.
   * A vehicle still surfaces here on its own whenever there's no rendered driver chip to fold it
   * into — no assignment for it, or its only assigned driver was itself suppressed by
   * hideSingleDriver. */
  combinedStandaloneVehicleKeys(trip: Trip): string[] {
    const pairedVehicleKeys = new Set(
      this.combinedChipDriverKeys(trip)
        .map(driverKey => trip.vehicleAssignments?.[driverKey])
        .filter((vehicleKey): vehicleKey is string => !!vehicleKey)
    );
    return trip.vehicles.filter(key => !pairedVehicleKeys.has(key));
  }

  // Never on a cancelled trip (see Trip.deleted): nobody has to be found for it and nothing has
  // to be assigned to it, so an amber "no driver assigned" beside a struck-through row is asking
  // the office to fix a trip that isn't happening. Conflicts drop out one level further up, in
  // Utility.computeAssignmentWarnings, which leaves such a trip out of the comparison entirely.
  hasDriverCountMismatch(trip: Trip): boolean {
    return this.showWarnings() && !trip.deleted && Utility.hasDriverStaffingWarning(trip);
  }

  hasVehicleCountMismatch(trip: Trip): boolean {
    return this.showWarnings() && !trip.deleted && Utility.hasVehicleStaffingWarning(trip);
  }

  // Empty and imbalanced are both warnings but they are not the same problem, and the tooltip is
  // the only thing that says which. "The numbers don't match" is actively wrong on a trip with
  // nobody and nothing assigned — the numbers match perfectly, at zero.
  driverWarningTooltip(trip: Trip): string {
    if (!this.hasDriverCountMismatch(trip)) return '';
    return trip.drivers.length === 0
      ? 'Der er ikke tildelt nogen chauffør til turen.'
      : 'Antallet af chauffører og køretøjer stemmer ikke overens.';
  }

  vehicleWarningTooltip(trip: Trip): string {
    if (!this.hasVehicleCountMismatch(trip)) return '';
    return trip.vehicles.length === 0
      ? 'Der er ikke tildelt noget køretøj til turen.'
      : 'Antallet af chauffører og køretøjer stemmer ikke overens.';
  }

  driverConflicts(trip: Trip, driverKey: string): Trip[] {
    if (!this.showWarnings()) return [];
    return this.assignmentWarnings()?.get(trip.$key)?.driverConflicts.get(driverKey) ?? [];
  }

  vehicleConflicts(trip: Trip, vehicleKey: string): Trip[] {
    if (!this.showWarnings()) return [];
    return this.assignmentWarnings()?.get(trip.$key)?.vehicleConflicts.get(vehicleKey) ?? [];
  }

  conflictTooltip(name: string | undefined, conflicts: Trip[]): string {
    if (!conflicts.length) return '';
    const parts = conflicts.map(t => `'${t.name}' ${Utility.timeRangeLabel(t)}`).join(', ');
    return `${name ?? 'Ressourcen'} er også tildelt: ${parts}.`;
  }

  /** The trip whose action buttons the pointer is currently over, if any — suppresses that row's
   * "Ændret …" tooltip (see modifiedLabel and the <tr> in the .html).
   *
   * The row tooltip opens the moment the pointer crosses into the row, so by the time it reaches
   * a button it is already sitting open below the row, competing with the button's own tooltip
   * ("Marker som afsluttet", "Tilføj rapport", ...). Hovering the actions is a deliberate reach
   * for one specific button, so the button's tooltip wins there and the row's steps aside.
   * Desktop-only in practice: the row tooltip is off for touch (matTooltipTouchGestures). */
  readonly hoveredActionsTripKey = signal<string | null>(null);

  setActionsHovered(trip: Trip, hovered: boolean): void {
    if (hovered) this.hoveredActionsTripKey.set(trip.$key);
    else if (this.hoveredActionsTripKey() === trip.$key) this.hoveredActionsTripKey.set(null);
  }

  isRecentlyModified(trip: Trip): boolean {
    return this.highlightModified() && !!trip.modified && trip.modified.isAfter(moment().subtract(24, 'hours'));
  }

  /** "Ændret …", plus "· Set …" once the signed-in driver's own reading of it has been recorded.
   *
   * The second half is the disclosure half: the office can see when a driver read a change, so the
   * driver is shown the same thing rather than being tracked silently. It deliberately ignores a
   * receipt the office wrote itself to clear a warning (TripRead.dismissed) — telling a driver
   * they saw something they never opened would be worse than saying nothing. */
  modifiedLabel(trip: Trip): string {
    if (!trip.modified) return '';
    const changed = `Ændret ${trip.modified.format('[d.] D. MMMM [kl.] HH:mm')}`;
    const own = this.ownRead(trip);
    return own ? `${changed} · Set ${own.at.format('[kl.] HH:mm')}` : changed;
  }

  /** Shown alongside the "Ændret …" highlight, but also on its own once that 24-hour window has
   * passed: a driver opening a change three days late should still be told it was recorded. */
  showsModifiedFooter(trip: Trip): boolean {
    return this.isRecentlyModified(trip) || !!this.ownRead(trip);
  }

  // --- Read receipts (see TripRead in trip.ts) ---------------------------------------------

  /** The signed-in driver's own genuine receipt for this trip's current version, if any. */
  private ownRead(trip: Trip): TripRead | null {
    const driverKey = this.currentDriverKey();
    if (!driverKey || !Utility.hasReadTrip(trip, driverKey)) return null;
    const read = trip.reads?.[driverKey];
    return read && !read.dismissed ? read : null;
  }

  /** What SeenWhenVisibleDirective watches for, or null to leave the row unobserved.
   *
   * Carries the version as well as the trip, so that an edit landing while the row is already
   * sitting still on screen re-arms the directive — no scroll happens, so nothing else would. */
  readToken(trip: Trip): string | null {
    const version = Utility.tripVersion(trip);
    const driverKey = this.currentDriverKey();
    if (!this.markReadWhenSeen() || version === null || !driverKey) return null;
    if (!trip.drivers.includes(driverKey)) return null;
    return Utility.hasReadTrip(trip, driverKey) ? null : `${trip.$key}:${version}`;
  }

  onSeen(trip: Trip): void {
    const version = Utility.tripVersion(trip);
    const driverKey = this.currentDriverKey();
    if (version === null || !driverKey) return;
    this.readReceipts.record(trip.$key, driverKey, version);
  }

  unreadDrivers(trip: Trip, drivers: Driver[] | null): Driver[] {
    return this.showReadReceipts() ? Utility.unreadDrivers(trip, drivers ?? []) : [];
  }

  hasUnreadWarning(trip: Trip, drivers: Driver[] | null): boolean {
    return this.showReadReceipts() && Utility.hasUnreadWarning(trip, drivers ?? []);
  }

  /** The text behind both the warning's tooltip and its confirmation dialog. Naming who *has*
   * read matters as much as who hasn't: on a trip with three drivers it is the difference between
   * "nobody knows" and "one person left to chase". */
  readReceiptSummary(trip: Trip, drivers: Driver[] | null): string {
    const unread = this.unreadDrivers(trip, drivers);
    if (!unread.length) return '';
    const unreadNames = unread.map(d => this.driverLabel(d, drivers)).join(', ');
    const readNames = trip.drivers
      .filter(key => !unread.some(d => d.$key === key))
      .map(key => {
        const at = trip.reads?.[key]?.at.format('[d.] D. MMMM [kl.] HH:mm');
        return `${this.getDriver(drivers, key)?.displayName ?? 'Ukendt'} ${at}`;
      });
    const readPart = readNames.length ? `Set af ${readNames.join(', ')}. ` : '';
    return `${readPart}Ikke set af ${unreadNames}.`;
  }

  /** Says *why* a driver can't have read it where that's knowable, so the office isn't left
   * wondering whether to keep waiting: neither of these two will ever produce a receipt. */
  private driverLabel(driver: Driver, drivers: Driver[] | null): string {
    const name = this.getDriver(drivers, driver.$key)?.displayName || 'Ukendt chauffør';
    if (driver.deleted) return `${name} (slettet)`;
    return driver.uid ? name : `${name} (intet login)`;
  }

  /** Clears the warning by recording an office receipt for whoever is still outstanding — the
   * admin has dealt with it some other way, typically a phone call. Not a permanent mute: the
   * next real edit re-stamps the trip and strands these receipts along with the genuine ones. */
  dismissReadWarning(trip: Trip, drivers: Driver[] | null, event: Event): void {
    // The row itself is click-to-edit, same reason openReports does this.
    event.stopPropagation();
    const version = Utility.tripVersion(trip);
    const unread = this.unreadDrivers(trip, drivers);
    if (version === null || !unread.length) return;
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      ...CONFIRM_DIALOG_CONFIG,
      data: {
        message: `${this.readReceiptSummary(trip, drivers)}\n\nVil du fjerne advarslen?`,
        confirmLabel: 'Fjern advarsel',
      } as ConfirmDialogData,
    });
    dialogRef.afterClosed().subscribe(confirmed => {
      if (!confirmed) return;
      // Only the outstanding drivers: an admin write cascades past the drivers' own monotonic
      // rule, so including someone who has genuinely read this would overwrite when they did.
      void this.writeFeedback.run(this.dataStore.dismissTripReadWarning(trip.$key, unread.map(d => d.$key), version));
    });
  }

  /** A trip that starts *after* the day it is being listed under: the 00:00–03:00 tail of the
   * night that day runs into, pulled into the plan on purpose (see DAY_PLAN_OVERNIGHT_HOURS in
   * data.service.ts) because that is the evening's work continuing, not tomorrow's.
   *
   * It is the one kind of trip here that appears twice — once at the foot of this day, once as
   * an ordinary trip of its own day — so the row says which of the two it really belongs to:
   * dimmed rather than presented as one of this day's own (see .trip-overnight in the .css), and
   * carrying the date it starts on (see overnightDateLabel). */
  startsAfterReference(trip: Trip): boolean {
    const reference = this.referenceDate();
    return !!reference && trip.start.isAfter(reference, 'day');
  }

  /** The day the two cells below measure "same day as this list" against.
   *
   * The reference day for every trip pulled in *for* that day, but an overnight trip's own start
   * day for an overnight trip. Without the second half both cells would see "not this day", draw
   * the em dash that says "this trip runs outside the day you're looking at" — and hide the very
   * times the trip was pulled in to show. The em dash is for a multi-day trip whose start or end
   * genuinely lies out of sight elsewhere in the week; an overnight trip's start and end are both
   * right here, a couple of hours past midnight. */
  private effectiveReference(trip: Trip): Moment | null {
    return this.startsAfterReference(trip) ? trip.start : this.referenceDate();
  }

  startsOutsideReference(trip: Trip): boolean {
    const reference = this.effectiveReference(trip);
    return !!reference && !Utility.sameDate(trip.start, reference);
  }

  endsOutsideReference(trip: Trip): boolean {
    const reference = this.effectiveReference(trip);
    return !!reference && !!trip.end && !Utility.sameDate(trip.end, reference);
  }

  /** The date an overnight trip starts on, shown beside its start time in the desktop table.
   * Weekday included, and spelled the short way: "which night is this?" is the whole question the
   * dimming raises, and "16/4" alone answers it only for someone who already knows what date
   * tomorrow is.
   *   The mobile card layout says the same thing once, in a heading above the group, instead of
   * on every card — see overnightHeading. */
  overnightDateLabel(trip: Trip): string {
    return this.startsAfterReference(trip) ? trip.start.format('ddd D/M') : '';
  }

  /** Whether this trip opens the overnight tail — the first of the run of trips at the foot of
   * the list that belong to the following morning. Drives the divider and heading the mobile card
   * layout puts in front of them (see .overnight-heading-row in the .css).
   *
   * A run, not a scatter: every list here is ordered by start (see DataStore.getTrips), so the
   * overnight trips are contiguous and last. This still asks about the trip *before* rather than
   * trusting that ordering blindly — an unordered list would get a heading per group rather than
   * one heading with ordinary trips loose underneath it, which is wrong but not misleading.
   *   Desktop gets no such heading: its rows carry the date individually, in a table whose Start
   * column makes the ordering plain, and a full-width heading row mid-table would read as a
   * second table starting. */
  startsOvernightTail(trip: Trip, index: number): boolean {
    if (!this.startsAfterReference(trip)) return false;
    const previous = this.trips()[index - 1];
    return !previous || !this.startsAfterReference(previous);
  }

  /** "Natten til søndag, 16. april" — the heading over the overnight group on a mobile card list.
   * Names the night rather than the date alone ("16. april" is ambiguous about whether the group
   * is tonight's late work or tomorrow's early work; "natten til søndag" is not). */
  overnightHeading(trip: Trip): string {
    return this.startsAfterReference(trip) ? `Natten til ${trip.start.format('dddd[,] [d.] D. MMMM')}` : '';
  }

  overnightTooltip(trip: Trip): string {
    if (!this.startsAfterReference(trip)) return '';
    return `Afgår natten til ${trip.start.format('dddd [d.] D. MMMM')} — turen fremgår også af denne dagsplan.`;
  }

  // Computed in TS rather than inline in the template — the desired "HH:mm–HH:mm" (or just
  // "HH:mm" with no end) has no room for stray whitespace, which stray whitespace inside
  // adjacent @if/@else blocks kept introducing.
  mobileTimeLabel(trip: Trip): string {
    const start = this.startsOutsideReference(trip) ? '—' : trip.start.format('HH:mm');
    if (!trip.end) return start;
    const end = this.endsOutsideReference(trip) ? '—' : trip.end.format('HH:mm');
    return `${start}–${end}`;
  }

  // Row click is the only way to edit now — there's no separate edit/delete button.
  onRowClick(trip: Trip): void {
    if (!this.readonly()) {
      this.edit.emit(trip);
    }
  }

  isFinished(trip: Trip): boolean {
    return this.showFinishToggle() && this.finishedTrips.isFinished(trip.$key);
  }

  // Purely local/on-device state (see FinishedTripsService) — stopPropagation so this never
  // triggers the row's own click-to-edit handler.
  toggleFinished(trip: Trip, event: Event): void {
    event.stopPropagation();
    this.finishedTrips.toggle(trip.$key);
  }

  hasMyReport(trip: Trip): boolean {
    const driverKey = this.currentDriverKey();
    return !!driverKey && !!trip.reports?.[driverKey];
  }

  hasAnyReport(trip: Trip): boolean {
    return !!trip.reports && Object.keys(trip.reports).length > 0;
  }

  // stopPropagation so this never triggers the row's own click-to-edit handler, same as the
  // finish-toggle above.
  openMyReport(trip: Trip, event: Event): void {
    event.stopPropagation();
    const driverKey = this.currentDriverKey();
    if (!driverKey) return;
    const instance = this.dialog.open(TripReportFormComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.trip = trip;
    instance.driverKey = driverKey;
  }

  openReports(trip: Trip, event: Event): void {
    event.stopPropagation();
    const instance = this.dialog.open(TripReportsDialogComponent, SMALL_DIALOG_CONFIG).componentInstance;
    instance.trip = trip;
  }
}
