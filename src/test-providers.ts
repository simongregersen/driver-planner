// Global Angular providers for every TestBed-based spec (see angular.json's test target
// `providersFile`) — mirrors app.config.ts's date-adapter setup, since Material's date/time
// inputs (used across most create/edit forms) throw without one.
import {MAT_DATE_LOCALE} from '@angular/material/core';
import {provideMomentDateAdapter} from '@angular/material-moment-adapter';

const DATE_FORMATS = {
  parse: {
    dateInput: 'YYYY-MM-DD',
    timeInput: 'HH:mm',
  },
  display: {
    dateInput: 'YYYY-MM-DD',
    timeInput: 'HH:mm',
    timeOptionLabel: 'HH:mm',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'LL',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

export default [
  {provide: MAT_DATE_LOCALE, useValue: 'da-DK'},
  provideMomentDateAdapter(DATE_FORMATS),
];
