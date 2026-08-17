import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

export interface Driver extends AngularFireObject {
  displayName: string;
  name: string;
  birthday: Moment | null;
  deleted: boolean;
  uid?: string;
  email?: string;
}

export interface NewDriver {
  displayName: string;
  name: string;
  birthday: Moment | null;
}
