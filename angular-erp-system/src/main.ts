import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideRouterStore } from '@ngrx/router-store';
import { provideServiceWorker } from '@angular/service-worker';
import { isDevMode } from '@angular/core';

import { routes } from './app/app.routes';
import { metaReducers, reducers } from './app/store';
import { AuthEffects } from './app/core/store/auth/auth.effects';
import { ThemeEffects } from './app/core/store/theme/theme.effects';
import { NotificationEffects } from './app/core/store/notification/notification.effects';
import { authInterceptor } from './app/core/interceptors/auth.interceptor';
import { errorInterceptor } from './app/core/interceptors/error.interceptor';
import { loadingInterceptor } from './app/core/interceptors/loading.interceptor';

bootstrapApplication(AppComponent, {
  providers: [
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
    provideRouterStore(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
}).catch(err => console.error(err));