import {AngularFireObject} from './angular-fire-object';
import moment, {Moment} from 'moment';

// A single driver's own report of how a trip actually went — added by that driver themselves
// from "Min dag" (see TripReportFormComponent), editable by an admin from Dagsplaner (see
// TripReportsDialogComponent). Each of the four readings (start time, end time, start km, end
// km) has its own "Garagen"/"Ved kunden" flag, since a driver may take some readings at the
// garage and others at the customer within the same report. Time readings default to "ved
// kunden" (a driver typically clocks in/out at the customer); km readings default to "garagen"
// (the odometer is usually read back at the garage) — see TripReportFormComponent's field
// initializers.
//
// Every field but those four flags is optional — nothing about a report is mandatory, so a
// driver can save just the part they have (a note, a single km reading, ...) without needing
// the rest.
export interface TripReport {
  start: Moment | null;
  startFromCustomer: boolean;
  end: Moment | null;
  endFromCustomer: boolean;
  startKm: number | null;
  startKmFromCustomer: boolean;
  endKm: number | null;
  endKmFromCustomer: boolean;
  note: string;
}

/** "This driver has seen this version of the trip" — the receipt behind the unread warning in
 * Dagsplaner. Written by that driver's own app when the trip row has actually been on their
 * screen (see SeenWhenVisibleDirective), never by a button they could learn to tap unread.
 *
 * `version` is the trip's `modified` value at the moment it was seen, and a receipt counts only
 * while the two still match — so an edit invalidates every receipt at once simply by re-stamping
 * `modified`, with nothing to reset. Trips with no `modified` carry no receipts at all: they were
 * published rather than changed, and publication is itself the first chance anyone had to read
 * them. See DataStore.markTripRead and Utility.tripVersion.
 *
 * `dismissed` marks a receipt the *office* wrote to clear a warning it had dealt with by other
 * means (a phone call, a driver with no login). The warning logic treats it exactly like a real
 * one — that's the point of it — but Min dag must not, or it would tell a driver they had seen
 * something they never opened. See DataStore.dismissTripReadWarning. */
export interface TripRead {
  at: Moment;
  version: number;
  dismissed: boolean;
}

/** The admin-only half of a trip, stored at /tripOffice/$tripKey rather than on the trip itself
 * — /trips is readable by every driver and RTDB read access cascades down, so a field kept there
 * is readable by them no matter what the UI does with it.
 *
 * Read only by key, never sorted or range-queried (DataStore already has the trip keys it needs
 * from the /trips query), so this deliberately carries no copy of the trip's dates to sort by —
 * and therefore nothing that could drift out of step with the trip. Absent entirely for a trip
 * with neither a note nor a label. */
export interface TripOffice {
  officeDescription?: string;
  labels?: string[];
}

export interface Trip extends AngularFireObject {
  start: Moment;
  end: Moment | null;
  name: string;
  description?: string;
  /** Admin-only note. Not stored on the trip — merged in from /tripOffice by
   * DataStore.getTripsWithOffice, so it is only ever populated for an admin. See TripOffice. */
  officeDescription?: string;
  /** Admin-only labels. Same storage and same caveat as officeDescription above. */
  labels?: string[];
  drivers: string[];
  vehicles: string[];
  /** Optional driver→vehicle pairing for this trip: keyed by driver key, valued by the vehicle
   * key they're assigned to drive. A driver with no entry here (or the trip having no
   * assignments at all — the common case for older trips and for trips still being planned)
   * simply hasn't been paired with a specific vehicle yet; drivers/vehicles counts routinely
   * differ during planning (see hasDriverCountMismatch/hasVehicleCountMismatch), so this is
   * always partial-tolerant. Several drivers may point at the same vehicle (shared/relief
   * driving); a driver points at at most one vehicle by construction of the map. Lives directly
   * on the trip, not in the admin-only /tripOffice side table (contrast officeDescription/
   * labels) — a driver needs to see which vehicle is theirs.
   *
   * Also deliberately absent for the single-driver/single-vehicle case even when the trip has
   * other fields set — the pairing there is unambiguous, so TripFormComponent never shows the
   * assignment UI for it and always submits an empty map (see
   * TripFormComponent.hasAmbiguousAssignment). */
  vehicleAssignments?: Record<string, string>;
  modified?: Moment;
  /** Cancelled: the trip was going to happen and now isn't, so it stays on the plan — struck
   * through on a red row in Min dag and Dagsplaner — instead of disappearing. A driver who has
   * already been told to drive somewhere has to be told when that is called off, and a row that
   * quietly vanishes from their day tells them nothing; they turn up for it. Filtered out of
   * every other view (see DataStore.getTrips' `includeDeleted`), since a cancelled trip is a
   * message rather than a booking: nothing to count, staff, or plan around.
   *   Set from "Aflys" in the trip editor and cleared by "Gendan" (see
   * DataStore.setTripCancelled). Deleting a trip with "Slet" still removes it outright, which is
   * both what to do with one that should never have been there and how a cancelled trip is
   * finally taken off the plan. Named `deleted` to match Driver/Vehicle's own soft-delete flag. */
  deleted: boolean;
  /** Derived and maintained by DataStore (addTrip/updateTrip/multiDayStart) purely as a query
   * optimization for getTrips — never set directly by a form or shown in the UI. Present (as
   * this trip's own start) only when it spans more than one calendar day; omitted entirely
   * otherwise, so it can be range-queried directly without also matching every ordinary
   * single-day trip. */
  multiDayStart?: number;
  /** Keyed by driver key — at most one report per driver per trip (see DataStore.setTripReport).
   * Optional at the trip level too: far from every trip needs one at all. */
  reports?: Record<string, TripReport>;
  /** Keyed by driver key — at most one receipt per driver per trip. Absent for every trip that
   * has never been changed after its day went public, which is most of them. See TripRead. */
  reads?: Record<string, TripRead>;
}

export interface NewTrip {
  start: Moment;
  end: Moment | null;
  name: string;
  description?: string;
  officeDescription?: string;
  labels?: string[];
  drivers: string[];
  vehicles: string[];
  vehicleAssignments?: Record<string, string>;
}

// --- Storage shapes, and the single boundary between them and the types above ----------------
//
// The interfaces above describe what the app wants a trip to be; the ones below describe what
// the Realtime Database can actually hand back, which is weaker in two ways that bite:
//
//   - Every field is optional. RTDB has no representation for an empty array, an empty object or
//     null — all three are stored as "no key at all" — so `drivers: []` written on save comes
//     back as `drivers: undefined` on read.
//   - Dates are numbers, since RTDB has no date type.
//
// listVal<T>/objectVal<T> do not validate anything; the generic is an unchecked assertion. So
// reading straight into Trip and patching it up afterwards (a `tap` that mutated the raw object
// through `as unknown as` casts) made the type a claim rather than a guarantee, and nothing
// forced that patching to cover every field. It didn't: `drivers`/`vehicles` were missed, and
// their absence surfaced much later as a TypeError when saving an edit to a trip that had none.
//
// Reading into TripRecord and converting through toTrip below puts every field in one place, and
// makes a newly added field on Trip a compile error until this conversion supplies it.

export interface TripReadRecord {
  at?: number;
  version?: number;
  dismissed?: boolean;
}

export interface TripReportRecord {
  start?: number | null;
  startFromCustomer?: boolean;
  end?: number | null;
  endFromCustomer?: boolean;
  startKm?: number | null;
  startKmFromCustomer?: boolean;
  endKm?: number | null;
  endKmFromCustomer?: boolean;
  note?: string;
}

/** Carries no officeDescription/labels: those are not stored on the trip at all, but merged in
 * from the /tripOffice side table afterwards by DataStore.attachOffice. See TripOffice.
 *
 * That holds for /trips only. A trip stored inside a *template* keeps both fields on the record
 * itself — see TemplateTripRecord below. */
export interface TripRecord extends AngularFireObject {
  start?: number;
  end?: number | null;
  name?: string;
  description?: string;
  drivers?: string[];
  vehicles?: string[];
  vehicleAssignments?: Record<string, string>;
  modified?: number;
  deleted?: boolean;
  multiDayStart?: number;
  reports?: Record<string, TripReportRecord>;
  reads?: Record<string, TripReadRecord>;
}

/** A trip stored inside a template, at /tripsInTemplate/$templateKey/$tripKey.
 *
 * The same shape as TripRecord plus the two admin-only fields, which live directly on the record
 * here rather than in a side table. /tripsInTemplate is admin-only end to end (see
 * database.rules.json) and templates are an office-only feature, so the reason /tripOffice exists
 * — keeping these unreadable by drivers, since read access on /trips cascades — simply doesn't
 * apply. Splitting them out here would buy nothing and cost a second node to keep in step.
 *
 * The split into /tripOffice happens on insertion instead: DataStore.insertTemplate hands each
 * trip to addTrip, which already routes these two fields to /tripOffice in its own atomic write.
 *
 * Reading these through toTrip (which drops them, correctly, for /trips) is what previously made
 * template labels and office notes invisible — and, because the trip editor resubmits every field
 * on save, made the first edit of a template trip overwrite them with blanks. */
export interface TemplateTripRecord extends TripRecord {
  officeDescription?: string;
  labels?: string[];
}

export function toTrip(record: TripRecord): Trip {
  return {
    $key: record.$key,
    // Neither query feeding this can return a trip without a start — both order by a
    // start-derived child, and RTDB excludes nodes missing the ordered child from a range query
    // — so this only covers the theoretical case. The epoch rather than moment(undefined), which
    // resolves to *now* and would pass for a real trip today.
    start: moment(record.start ?? 0),
    end: record.end != null ? moment(record.end) : null,
    name: record.name ?? '',
    description: record.description,
    drivers: record.drivers ?? [],
    vehicles: record.vehicles ?? [],
    vehicleAssignments: record.vehicleAssignments,
    modified: record.modified != null ? moment(record.modified) : undefined,
    // Written only by the soft delete itself, so the absent key — every trip that has never been
    // deleted, which is nearly all of them — reads as false. Same shape as Driver.deleted.
    deleted: record.deleted ?? false,
    multiDayStart: record.multiDayStart,
    reports: record.reports
      ? Object.fromEntries(Object.entries(record.reports).map(([driverKey, r]) => [driverKey, toTripReport(r)]))
      : undefined,
    reads: record.reads
      ? Object.fromEntries(Object.entries(record.reads).map(([driverKey, r]) => [driverKey, toTripRead(r)]))
      : undefined,
  };
}

// `at` and `version` are always written together by DataStore.markTripRead/dismissTripReadWarning
// and both are required by the security rules, so the fallbacks below only ever apply to a record
// written by something other than this app. `version: 0` is deliberately a value no trip can
// match — a trip with no `modified` accepts no receipts at all — so a malformed record reads as
// "not seen" rather than as a receipt for whatever the trip happens to say now.
function toTripRead(record: TripReadRecord): TripRead {
  return {
    at: moment(record.at ?? 0),
    version: record.version ?? 0,
    dismissed: record.dismissed ?? false,
  };
}

// The four ...FromCustomer flags are always written together by DataStore.setTripReport, and RTDB
// does store `false`, so their fallbacks below only ever apply to a record written by something
// other than this app.
function toTripReport(record: TripReportRecord): TripReport {
  return {
    start: record.start != null ? moment(record.start) : null,
    startFromCustomer: record.startFromCustomer ?? false,
    end: record.end != null ? moment(record.end) : null,
    endFromCustomer: record.endFromCustomer ?? false,
    startKm: record.startKm ?? null,
    startKmFromCustomer: record.startKmFromCustomer ?? false,
    endKm: record.endKm ?? null,
    endKmFromCustomer: record.endKmFromCustomer ?? false,
    note: record.note ?? '',
  };
}


/** Mirrors DataStore.attachOffice's own defaulting, so a template trip and an ordinary trip with
 * office data attached are indistinguishable to everything downstream (the trip editor, the trip
 * list's label chips, addTrip on insertion). */
export function toTemplateTrip(record: TemplateTripRecord): Trip {
  return {
    ...toTrip(record),
    officeDescription: record.officeDescription,
    labels: record.labels ?? [],
  };
}
