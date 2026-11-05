import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { LocationStrategy, TrailingSlashPathLocationStrategy } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })),
    // URLs end in a slash (site-structure spec, "URL conventions").
    { provide: LocationStrategy, useClass: TrailingSlashPathLocationStrategy },
    provideHttpClient(withFetch()),
    provideClientHydration(withEventReplay()),
  ],
};
