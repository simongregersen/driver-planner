import {Driver} from './driver';

export interface Trip {
  id: number;
  start: Date;
  end: Date;
  name: string;
  description: string;
  drivers: Driver[]
}
