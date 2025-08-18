import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { switchMap, take } from 'rxjs/operators';

import { selectAuthToken } from '@core/store/auth/auth.selectors';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const store = inject(Store);

  // Skip authentication for auth endpoints
  const authEndpoints = ['/auth/login', '/auth/register', '/auth/forgot-password', '/auth/reset-password'];
  const isAuthEndpoint = authEndpoints.some(endpoint => req.url.includes(endpoint));

  if (isAuthEndpoint) {
    return next(req);
  }

  // Add authorization header if token exists
  return store.select(selectAuthToken).pipe(
    take(1),
    switchMap(token => {
      let authReq = req;

      if (token) {
        authReq = req.clone({
          setHeaders: {
            Authorization: `Bearer ${token}`
          }
        });
      }

      return next(authReq);
    })
  );
};