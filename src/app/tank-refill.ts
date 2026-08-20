import {AngularFireObject} from './angular-fire-object';
import moment, {Moment} from 'moment';

// Fuel the external supplier delivers into the company's own tank — distinct from FuelReport,
// which is a vehicle being refuelled *from* that tank. Stored flat at /tankRefills/$key (there's
// only one tank, unlike fuelReports which are keyed per vehicle) and admin-only throughout, see
// database.rules.json — drivers never read or write this collection at all.
export interface TankRefill extends AngularFireObject {
  date: Moment;
  liters: number;
  price: number;
}

export interface NewTankRefill {
  date: Moment;
  liters: number;
  price: number;
}

// The storage shape of the above, and the boundary between them — see trip.ts for the full
// reasoning behind the split. In short: RTDB returns every field as optional (it has no
// representation for null, an empty array or an empty object — all three are simply an absent
// key) and every date as a number, and listVal/objectVal assert their generic without checking
// it. Converting through one function per type is what makes the interface above a guarantee
// rather than a claim.

export interface TankRefillRecord extends AngularFireObject {
  date?: number;
  liters?: number;
  price?: number;
}

export function toTankRefill(record: TankRefillRecord): TankRefill {
  return {
    $key: record.$key,
    date: moment(record.date ?? 0),
    liters: record.liters ?? 0,
    price: record.price ?? 0,
  };
}
