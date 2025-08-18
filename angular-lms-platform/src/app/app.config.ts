import { ApplicationConfig, importProvidersFrom, isDevMode } from '@angular/core';
import { provideRouter, withEnabledBlockingInitialNavigation, withInMemoryScrolling } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';

// NgRx
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { provideRouterStore } from '@ngrx/router-store';

// Translation
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { HttpClient } from '@angular/common/http';

// Material
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';

// App imports
import { routes } from './app.routes';
import { appReducers } from './core/store/app.state';
import { AuthEffects } from './core/store/auth/auth.effects';
import { CourseEffects } from './core/store/course/course.effects';
import { UserEffects } from './core/store/user/user.effects';
import { AssessmentEffects } from './core/store/assessment/assessment.effects';
import { ChatEffects } from './core/store/chat/chat.effects';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { cacheInterceptor } from './core/interceptors/cache.interceptor';

// Translation loader factory
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

export const appConfig: ApplicationConfig = {
  providers: [
    // Router configuration
    provideRouter(
      routes,
      withEnabledBlockingInitialNavigation(),
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled'
      })
    ),

    // HTTP Client with interceptors
    provideHttpClient(
      withFetch(),
      withInterceptors([
        authInterceptor,
        errorInterceptor,
        loadingInterceptor,
        cacheInterceptor
      ])
    ),

    // Client hydration for SSR
    provideClientHydration(),

    // Animations
    provideAnimationsAsync(),

    // Service Worker for PWA
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),

    // NgRx Store
    provideStore(appReducers),
    provideEffects([
      AuthEffects,
      CourseEffects,
      UserEffects,
      AssessmentEffects,
      ChatEffects
    ]),
    provideRouterStore(),
    provideStoreDevtools({
      maxAge: 25,
      logOnly: !isDevMode(),
      autoPause: true,
      trace: false,
      traceLimit: 75,
      connectInZone: true
    }),

    // Material Date Adapter
    provideNativeDateAdapter(),

    // Translation module
    importProvidersFrom(
      TranslateModule.forRoot({
        loader: {
          provide: TranslateService,
          useFactory: HttpLoaderFactory,
          deps: [HttpClient]
        },
        defaultLanguage: 'en'
      })
    ),

    // Material Design configuration
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: {
        appearance: 'outline',
        subscriptSizing: 'dynamic'
      }
    },
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: {
        duration: 5000,
        horizontalPosition: 'end',
        verticalPosition: 'top'
      }
    },
    {
      provide: MAT_DATE_LOCALE,
      useValue: 'en-US'
    }
  ]
};