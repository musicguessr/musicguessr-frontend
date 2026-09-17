import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  isDevMode,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDe from '@angular/common/locales/de';
import localeNl from '@angular/common/locales/nl';
import localePl from '@angular/common/locales/pl';
import { PreloadAllModules, provideRouter, withComponentInputBinding, withPreloading } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { ConfigService } from './services/config.service';
import { GlobalErrorHandler } from './services/global-error-handler';

// DatePipe only ships en-US data; without these, expiry dates rendered in
// US format on the Polish/German/Dutch pages.
registerLocaleData(localePl, 'pl');
registerLocaleData(localeDe, 'de');
registerLocaleData(localeNl, 'nl');

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withPreloading(PreloadAllModules)),
    provideHttpClient(withXhr()),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideAppInitializer(async () => {
      const configService = inject(ConfigService);
      await configService.load();
    }),
    // registerWhenStable defers registration until the app goes idle, so the
    // worker install never competes with the first paint or with the camera
    // permission prompt on /scan. The 30s cap means it still registers on a
    // page that never fully settles (the game page holds a playing iframe,
    // which can keep the app from ever reporting stable).
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
