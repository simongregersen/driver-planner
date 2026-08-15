import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

export interface Vehicle extends AngularFireObject {
  displayName: string;
  brand: string;
  regNo: string;
  latestInspection: Date | null;
  isRutebus: boolean;
  deleted: boolean;
}

export interface NewVehicle {
  displayName: string;
  brand: string;
  regNo: string;
  latestInspection: Moment | null;
  isRutebus: boolean;
}
