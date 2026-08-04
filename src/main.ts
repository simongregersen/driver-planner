import { platformBrowser } from '@angular/platform-browser';
import { provideZoneChangeDetection } from '@angular/core';

import { AppModule } from './app/app.module';

// bootstrapModule() defaults to zoneless (NoopNgZone) regardless of the
// zone.js polyfill; this must be supplied via `applicationProviders` (not
// AppModule's own `providers`) because that's the injector tier that
// actually wires up ApplicationRef's change-detection scheduler.
platformBrowser().bootstrapModule(AppModule, {
  applicationProviders: [provideZoneChangeDetection()]
})
  .catch(err => console.error(err));
