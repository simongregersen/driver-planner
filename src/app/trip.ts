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

export interface Trip extends AngularFireObject {
  start: Moment;
  end: Moment | null;
  name: string;
  description?: string;
  /** Admin-only note, never shown to drivers (see TripsComponent's showOfficeNotes input). */
  officeDescription?: string;
  /** Admin-only labels, never shown to drivers (see TripsComponent's showLabels input). */
  labels?: string[];
  drivers: string[];
  vehicles: string[];
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
}
