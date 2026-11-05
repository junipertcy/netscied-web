import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { LocationStrategy, TrailingSlashPathLocationStrategy } from '@angular/common';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideRouter, UrlSerializer, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { LenientUrlSerializer } from './core/url-serializer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })),
    // A malformed percent-escape in a shared URL must not send the visitor home (final review W5).
    { provide: UrlSerializer, useClass: LenientUrlSerializer },
    // URLs end in a slash (site-structure spec, "URL conventions").
    { provide: LocationStrategy, useClass: TrailingSlashPathLocationStrategy },
    provideHttpClient(withFetch()),
    provideClientHydration(withEventReplay()),
  ],
};
