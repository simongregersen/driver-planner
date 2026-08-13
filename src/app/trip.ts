import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

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
