import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

// Stored at fuelReports/$vehicleKey/$reportKey (see DataStore) — keyed by vehicle rather than
// driver, since the odometer/fuel reading is a fact about the vehicle, not the driver, and
// there's no fixed driver-to-vehicle assignment in this app to key on instead. driverKey is
// carried as a field so a report can still be attributed to (and only edited by) whoever
// reported it — see database.rules.json's per-record ownership check.
export interface FuelReport extends AngularFireObject {
  date: Moment;
  driverKey: string;
  odometerKm: number;
  liters: number;
  note?: string;
}

export interface NewFuelReport {
  date: Moment;
  driverKey: string;
  odometerKm: number;
  liters: number;
  note?: string;
}
