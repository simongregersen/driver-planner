import {ApplicationConfig, LOCALE_ID, provideZoneChangeDetection} from '@angular/core';
import {provideRouter} from '@angular/router';
import {registerLocaleData} from '@angular/common';
import localeDa from '@angular/common/locales/da';
import {MAT_DATE_LOCALE} from '@angular/material/core';
import {provideMomentDateAdapter} from '@angular/material-moment-adapter';
// Teaches moment Danish month/day names and a Monday week start, which the Material
// date adapter reads for the calendar header.
import 'moment/locale/da';
import {routes} from './app.routes';

registerLocaleData(localeDa);

// Matches the ISO-style dates the app has always shown in its date inputs.
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

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideRouter(routes),
    {provide: LOCALE_ID, useValue: 'da-DK'},
    {provide: MAT_DATE_LOCALE, useValue: 'da-DK'},
    provideMomentDateAdapter(DATE_FORMATS),
  ],
};
