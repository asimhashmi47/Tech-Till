import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { LUCIDE_ICONS, LucideIconProvider } from 'lucide-angular';

import { APP_ICONS } from './core/icons';
import {
  authInterceptor,
  errorInterceptor,
  progressInterceptor,
} from './core/interceptors/http.interceptors';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      withComponentInputBinding(),

      // Each page starts at the top, and the back button restores where the user was.
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),

    // Order matters: progress starts first and finishes last, the token is attached
    // before the request goes out, and errors are mapped on the way back.
    provideHttpClient(
      withInterceptors([progressInterceptor, authInterceptor, errorInterceptor]),
    ),

    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider(APP_ICONS) },
  ],
};
