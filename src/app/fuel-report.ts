import {AngularFireObject} from './angular-fire-object';
import moment, {Moment} from 'moment';

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
  /** Admin-only — see FuelTrackingComponent.vehicleGroups and DataStore.setFuelReportExcluded.
   * Never set through NewFuelReport/the shared create-edit form, so a driver can't report it. */
  excludeFromStatistics?: boolean;
}

export interface NewFuelReport {
  date: Moment;
  driverKey: string;
  odometerKm: number;
  liters: number;
  note?: string;
}

// The storage shape of the above, and the boundary between them — see trip.ts for the full
// reasoning behind the split. In short: RTDB returns every field as optional (it has no
// representation for null, an empty array or an empty object — all three are simply an absent
// key) and every date as a number, and listVal/objectVal assert their generic without checking
// it. Converting through one function per type is what makes the interface above a guarantee
// rather than a claim.

export interface FuelReportRecord extends AngularFireObject {
  date?: number;
  driverKey?: string;
  odometerKm?: number;
  liters?: number;
  note?: string;
  excludeFromStatistics?: boolean;
}

export function toFuelReport(record: FuelReportRecord): FuelReport {
  return {
    $key: record.$key,
    date: moment(record.date ?? 0),
    driverKey: record.driverKey ?? '',
    // Both are always written by addFuelReport, and RTDB does store 0, so these fallbacks only
    // apply to a record this app didn't write.
    odometerKm: record.odometerKm ?? 0,
    liters: record.liters ?? 0,
    note: record.note,
    excludeFromStatistics: record.excludeFromStatistics,
  };
}
