import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

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
  /** Derived and maintained by DataStore (addTrip/updateTrip/multiDayStart) purely as a query
   * optimization for getTrips — never set directly by a form or shown in the UI. Present (as
   * this trip's own start) only when it spans more than one calendar day; omitted entirely
   * otherwise, so it can be range-queried directly without also matching every ordinary
   * single-day trip. */
  multiDayStart?: number;
  /** Keyed by driver key — at most one report per driver per trip (see DataStore.setTripReport).
   * Optional at the trip level too: far from every trip needs one at all. */
  reports?: Record<string, TripReport>;
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
