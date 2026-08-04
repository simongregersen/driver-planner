import {AngularFireObject} from './angular-fire-object';
export interface Vehicle extends AngularFireObject {
  displayName: string;
  brand: string;
  regNo: string;
  latestInspection: Date | null;
  deleted: boolean;
}
