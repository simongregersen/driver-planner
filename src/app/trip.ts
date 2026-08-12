import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

export interface Trip extends AngularFireObject {
  start: Moment;
  end: Moment | null;
  name: string;
  description: string;
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
  description: string;
  drivers: string[];
  vehicles: string[];
}
