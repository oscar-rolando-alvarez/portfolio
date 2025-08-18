import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideRouterStore } from '@ngrx/router-store';
import { isDevMode } from '@angular/core';

import { routes } from './app.routes';
import { metaReducers, reducers } from './store';
import { AuthEffects } from '@core/store/auth/auth.effects';
import { ThemeEffects } from '@core/store/theme/theme.effects';
import { NotificationEffects } from '@core/store/notification/notification.effects';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { errorInterceptor } from '@core/interceptors/error.interceptor';
import { loadingInterceptor } from '@core/interceptors/loading.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(
      withInterceptors([
        authInterceptor,
        errorInterceptor,
        loadingInterceptor
      ])
    ),
    provideStore(reducers, { metaReducers }),
    provideEffects([
      AuthEffects,
      ThemeEffects,
      NotificationEffects
    ]),
    provideStoreDevtools({
      maxAge: 25,
      logOnly: !isDevMode(),
      autoPause: true,
      trace: false,
      traceLimit: 75
    }),
    provideRouterStore()
  ]
};