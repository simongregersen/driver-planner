import {ApplicationConfig, importProvidersFrom, LOCALE_ID, provideZoneChangeDetection} from '@angular/core';
import {provideRouter} from '@angular/router';
import {registerLocaleData} from '@angular/common';
import localeDa from '@angular/common/locales/da';
import {ConfirmationPopoverModule} from 'angular-confirmation-popover';
import {routes} from './app.routes';

registerLocaleData(localeDa);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideRouter(routes),
    {provide: LOCALE_ID, useValue: 'da-DK'},
    importProvidersFrom(ConfirmationPopoverModule.forRoot()),
  ],
};
