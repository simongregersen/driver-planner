import {ApplicationConfig, Injector, LOCALE_ID, inject, provideAppInitializer, provideZoneChangeDetection, isDevMode} from '@angular/core';
import {PreloadAllModules, provideRouter, withPreloading, withRouterConfig} from '@angular/router';
import {registerLocaleData} from '@angular/common';
import localeDa from '@angular/common/locales/da';
import {MAT_DATE_LOCALE} from '@angular/material/core';
import {provideMomentDateAdapter} from '@angular/material-moment-adapter';
// Teaches moment Danish month/day names and a Monday week start, which the Material
// date adapter reads for the calendar header.
import 'moment/locale/da';
import {routes} from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import {MAT_DIALOG_SCROLL_STRATEGY} from '@angular/material/dialog';
import {MAT_BOTTOM_SHEET_DEFAULT_OPTIONS} from '@angular/material/bottom-sheet';
import {createBlockScrollStrategy} from '@angular/cdk/overlay';
import {BreakpointService} from './breakpoint.service';
import {MobileScrollBlockStrategy} from './mobile-scroll-block-strategy';
import {DatepickerScrollBlockWatcher} from './datepicker-scroll-block-watcher';

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
    // Every route is lazy (`loadComponent`), and with no preloading, the very first click on a
    // nav link like Periodeplaner has to fetch+parse that chunk before anything can even mount —
    // there's nothing on screen to show it registered at all until that finishes. PreloadAllModules
    // fetches every route's chunk in the background shortly after the app first stabilizes, so by
    // the time a real click happens the chunk is usually already cached. urlUpdateStrategy: 'eager'
    // covers the rest of the gap (a cold cache, a slow connection) — it flips the URL/active-tab
    // highlight the instant the click is accepted, before the chunk or that page's own data fetch
    // resolves, rather than waiting for the whole navigation to finish. The destination component's
    // own loading spinner (every routed page already has one) takes it from there.
    provideRouter(routes, withPreloading(PreloadAllModules), withRouterConfig({urlUpdateStrategy: 'eager'})),
    {provide: LOCALE_ID, useValue: 'da-DK'},
    {provide: MAT_DATE_LOCALE, useValue: 'da-DK'},
    provideMomentDateAdapter(DATE_FORMATS),
    provideServiceWorker('combined-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    // CDK's default BlockScrollStrategy toggles <html> to position:fixed (its
    // cdk-global-scrollblock class) on every single overlay open/close. On iOS Safari in
    // standalone PWA mode, that re-layout is what makes the viewport-height calculation
    // underlying the bottom nav's safe-area handling briefly go stale, which is what shows up as
    // a white bar under the bottom nav whenever a dialog opens. On mobile, use
    // MobileScrollBlockStrategy instead — it blocks the same background scroll without touching
    // <html>/<body> layout at all, so it can't retrigger that instability. Desktop keeps CDK's
    // own strategy, since the bug doesn't occur there.
    {
      provide: MAT_DIALOG_SCROLL_STRATEGY,
      useFactory: () => {
        const injector = inject(Injector);
        const breakpoints = inject(BreakpointService);
        return () => breakpoints.isMobile() ? new MobileScrollBlockStrategy() : createBlockScrollStrategy(injector);
      },
    },
    // Same root cause as above, for the mobile-only "Mere" bottom sheet — this one has no
    // desktop use, so it's unconditional.
    {
      provide: MAT_BOTTOM_SHEET_DEFAULT_OPTIONS,
      useFactory: () => ({scrollStrategy: new MobileScrollBlockStrategy()}),
    },
    // Eagerly instantiates the root-provided watcher (see its own doc comment) so it starts
    // observing <html> right away, rather than lazily on first use — there's no natural first
    // "use" of it to hang that off of, unlike an actual injected dependency.
    provideAppInitializer(() => {
      inject(DatepickerScrollBlockWatcher);
    }),
  ],
};
