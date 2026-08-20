import {ChangeDetectionStrategy, Component, inject, input, OnInit, output} from '@angular/core';
import {AsyncPipe, DatePipe, NgTemplateOutlet} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatChipsModule} from '@angular/material/chips';
import {MatDialog} from '@angular/material/dialog';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Trip} from '../trip';
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
import {SMALL_DIALOG_CONFIG} from '../dialog-config';

@Component({
  standalone: true,
  selector: 'app-trips',
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.css'],
  imports: [
    AsyncPipe, DatePipe, NgTemplateOutlet,
    MatButtonModule, MatChipsModule, MatIconModule, MatProgressSpinnerModule, MatTooltipModule,
    RichTextComponent,
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
  /** The single day this list is being shown under, if any (a day-plans/period-plans day-block,
   * my-trips' selected day, ...) — lets a multi-day trip's start time be marked with an asterisk
   * and a fuller tooltip on the days it didn't actually start on. Templates/other callers with
   * no such day context simply leave this unset, and no trip ever gets marked. */
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

  hasDriverCountMismatch(trip: Trip): boolean {
    return this.showWarnings() && Utility.hasDriverStaffingWarning(trip);
  }

  hasVehicleCountMismatch(trip: Trip): boolean {
    return this.showWarnings() && Utility.hasVehicleStaffingWarning(trip);
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

  isRecentlyModified(trip: Trip): boolean {
    return this.highlightModified() && !!trip.modified && trip.modified.isAfter(moment().subtract(24, 'hours'));
  }

  modifiedLabel(trip: Trip): string {
    return trip.modified ? `Ændret ${trip.modified.format('[d.] D. MMMM [kl.] HH:mm')}` : '';
  }

  startsOutsideReference(trip: Trip): boolean {
    const reference = this.referenceDate();
    return !!reference && !Utility.sameDate(trip.start, reference);
  }

  endsOutsideReference(trip: Trip): boolean {
    const reference = this.referenceDate();
    return !!reference && !!trip.end && !Utility.sameDate(trip.end, reference);
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
