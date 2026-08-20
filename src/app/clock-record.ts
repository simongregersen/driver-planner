import {AngularFireObject} from './angular-fire-object';
import moment, {Moment} from 'moment';

export interface ClockRecord extends AngularFireObject {
  clockIn: Moment;
  clockOut: Moment | null;
  note?: string;
  /** Day-rate pay ("Døgnbetaling") instead of hourly — see TimeReportComponent for how this is summed. */
  dognbetaling?: boolean;
}

// The storage shape of the above, and the boundary between them — see trip.ts for the full
// reasoning behind the split. In short: RTDB returns every field as optional (it has no
// representation for null, an empty array or an empty object — all three are simply an absent
// key) and every date as a number, and listVal/objectVal assert their generic without checking
// it. Converting through one function per type is what makes the interface above a guarantee
// rather than a claim.

/** Named "Stored..." rather than ClockRecordRecord, which the ...Record convention used by every
 * other type here would produce. */
export interface StoredClockRecord extends AngularFireObject {
  clockIn?: number;
  clockOut?: number | null;
  note?: string;
  dognbetaling?: boolean;
}

export function toClockRecord(record: StoredClockRecord): ClockRecord {
  return {
    $key: record.$key,
    // Every query for these orders by clockIn, and RTDB drops nodes missing the ordered child
    // from a range query, so a record without one can't reach here. The epoch rather than
    // moment(undefined), which would resolve to "now" and pass for a real punch today.
    clockIn: moment(record.clockIn ?? 0),
    clockOut: record.clockOut != null ? moment(record.clockOut) : null,
    note: record.note,
    dognbetaling: record.dognbetaling,
  };
}
