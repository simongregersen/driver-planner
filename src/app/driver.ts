import {AngularFireObject} from './angular-fire-object';
import moment, {Moment} from 'moment';

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

// The storage shape of the above, and the boundary between them — see trip.ts for the full
// reasoning behind the split. In short: RTDB returns every field as optional (it has no
// representation for null, an empty array or an empty object — all three are simply an absent
// key) and every date as a number, and listVal/objectVal assert their generic without checking
// it. Converting through one function per type is what makes the interface above a guarantee
// rather than a claim.

export interface DriverRecord extends AngularFireObject {
  displayName?: string;
  name?: string;
  birthday?: number | null;
  deleted?: boolean;
  uid?: string;
  email?: string;
}

export function toDriver(record: DriverRecord): Driver {
  return {
    $key: record.$key,
    displayName: record.displayName ?? '',
    name: record.name ?? '',
    birthday: record.birthday != null ? moment(record.birthday) : null,
    // Written explicitly as false on create, and RTDB does store false — but a driver record
    // predating that field would have no key at all, and "not deleted" is the right reading.
    deleted: record.deleted ?? false,
    uid: record.uid,
    email: record.email,
  };
}
