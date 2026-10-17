import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideEffects } from '@ngrx/effects';
import { provideStore } from '@ngrx/store';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { metaReducers, reducers } from './store';
import { AuthEffects } from '@core/store/auth/auth.effects';
import { NotificationEffects } from '@core/store/notification/notification.effects';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { loadingInterceptor } from '@core/interceptors/loading.interceptor';
import { mockBackendInterceptor } from '@core/mock/mock-backend.interceptor';
import { AuthService } from '@core/services/auth.service';
import { environment } from '@environments/environment';

/**
 * Root application configuration.
 *
 * Angular 22 is zoneless by default, so no zone.js polyfill or
 * provideZoneChangeDetection() is needed: change detection is driven by
 * signals, the async pipe and template events.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Restore a persisted session before the first navigation so guards see the right state.
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(
      withFetch(),
      withInterceptors([
        authInterceptor,
        loadingInterceptor,
        errorInterceptor,
        // The in-memory backend must be last so it sees the fully decorated request.
        ...(environment.enableMocking ? [mockBackendInterceptor] : []),
      ]),
    ),
    provideStore(reducers, { metaReducers }),
    provideEffects([AuthEffects, NotificationEffects]),
    provideStoreDevtools({
      maxAge: 25,
      logOnly: !isDevMode(),
      autoPause: true,
    }),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
