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
}

export interface NewTrip {
  start: Moment;
  end: Moment | null;
  name: string;
  description: string;
  drivers: string[];
  vehicles: string[];
}
