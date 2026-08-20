import {AngularFireObject} from './angular-fire-object';
import moment, {Moment} from 'moment';

// A planning note — a driver on vacation, a vehicle in the shop, or similar — separate from
// Trip since it isn't tied to a specific run, just a date range it applies across.
export interface Note extends AngularFireObject {
  start: Moment;
  end: Moment;
  text: string;
  drivers: string[];
  vehicles: string[];
}

export interface NewNote {
  start: Moment;
  end: Moment;
  text: string;
  drivers: string[];
  vehicles: string[];
}

// The storage shape of the above, and the boundary between them — see trip.ts for the full
// reasoning behind the split. In short: RTDB returns every field as optional (it has no
// representation for null, an empty array or an empty object — all three are simply an absent
// key) and every date as a number, and listVal/objectVal assert their generic without checking
// it. Converting through one function per type is what makes the interface above a guarantee
// rather than a claim.

export interface NoteRecord extends AngularFireObject {
  start?: number;
  end?: number;
  text?: string;
  drivers?: string[];
  vehicles?: string[];
}

export function toNote(record: NoteRecord): Note {
  return {
    $key: record.$key,
    // Truncated to the start of the day, since a note's range is in whole days — the same thing
    // DateUtility.getDate does, inlined so this stays a plain function with no injected service.
    start: moment(record.start ?? 0).startOf('day'),
    end: moment(record.end ?? 0).startOf('day'),
    text: record.text ?? '',
    drivers: record.drivers ?? [],
    vehicles: record.vehicles ?? [],
  };
}
