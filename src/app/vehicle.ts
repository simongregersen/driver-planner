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

// The storage shape of the above, and the boundary between them — see trip.ts for the full
// reasoning behind the split. In short: RTDB returns every field as optional (it has no
// representation for null, an empty array or an empty object — all three are simply an absent
// key) and every date as a number, and listVal/objectVal assert their generic without checking
// it. Converting through one function per type is what makes the interface above a guarantee
// rather than a claim.

export interface VehicleRecord extends AngularFireObject {
  displayName?: string;
  brand?: string;
  regNo?: string;
  latestInspection?: number | null;
  isRutebus?: boolean;
  deleted?: boolean;
}

export function toVehicle(record: VehicleRecord): Vehicle {
  return {
    $key: record.$key,
    displayName: record.displayName ?? '',
    brand: record.brand ?? '',
    regNo: record.regNo ?? '',
    // A Date, not a Moment — see Vehicle above; the Material datepicker on the vehicle form is
    // the only consumer and it is not on the Moment adapter.
    latestInspection: record.latestInspection != null ? new Date(record.latestInspection) : null,
    isRutebus: record.isRutebus ?? false,
    deleted: record.deleted ?? false,
  };
}
