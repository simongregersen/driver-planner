import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

export interface TripReport {
  actualStart?: Moment | null;
  garageReturn?: Moment | null;
  actualEnd?: Moment | null;
}

export interface Trip extends AngularFireObject {
  start: Moment;
  end: Moment | null;
  name: string;
  description: string;
  drivers: string[];
  vehicles: string[];
  modified?: Moment;
  reports?: {[driverKey: string]: TripReport};
}

export interface NewTrip {
  start: Moment;
  end: Moment | null;
  name: string;
  description: string;
  drivers: string[];
  vehicles: string[];
}
