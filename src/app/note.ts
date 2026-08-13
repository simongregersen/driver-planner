import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

// A planning note — a driver on vacation, a vehicle in the shop, or similar — separate from
// Trip since it isn't tied to a specific run, just a date range it applies across.
export interface Note extends AngularFireObject {
  start: Moment;
  end: Moment;
  text: string;
  drivers: string[];
  vehicles: string[];
}

export interface NewNote {
  start: Moment;
  end: Moment;
  text: string;
  drivers: string[];
  vehicles: string[];
}
