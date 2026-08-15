import {AngularFireObject} from './angular-fire-object';
import {Moment} from 'moment';

export interface ClockRecord extends AngularFireObject {
  clockIn: Moment;
  clockOut: Moment | null;
  note?: string;
  /** Day-rate pay ("Døgnbetaling") instead of hourly — see TimeReportComponent for how this is summed. */
  dognbetaling?: boolean;
}
