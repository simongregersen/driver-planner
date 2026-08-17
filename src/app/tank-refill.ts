import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

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
