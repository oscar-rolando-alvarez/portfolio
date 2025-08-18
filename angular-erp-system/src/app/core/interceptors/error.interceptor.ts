import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { NotificationService } from '@core/services/notification.service';
import * as AuthActions from '@core/store/auth/auth.actions';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const store = inject(Store);
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An unexpected error occurred';

      switch (error.status) {
        case 0:
          errorMessage = 'Unable to connect to the server. Please check your internet connection.';
          break;
        
        case 400:
          errorMessage = error.error?.message || 'Bad request. Please check your input.';
          break;
        
        case 401:
          errorMessage = 'Your session has expired. Please log in again.';
          store.dispatch(AuthActions.sessionExpired());
          router.navigate(['/auth/login']);
          break;
        
        case 403:
          errorMessage = 'You do not have permission to perform this action.';
          break;
        
        case 404:
          errorMessage = 'The requested resource was not found.';
          break;
        
        case 422:
          errorMessage = error.error?.message || 'Validation error. Please check your input.';
          break;
        
        case 429:
          errorMessage = 'Too many requests. Please try again later.';
          break;
        
        case 500:
          errorMessage = 'Internal server error. Please try again later.';
          break;
        
        case 502:
        case 503:
        case 504:
          errorMessage = 'Server is temporarily unavailable. Please try again later.';
          break;
        
        default:
          if (error.error?.message) {
            errorMessage = error.error.message;
          }
      }

      // Don't show notifications for certain endpoints or error types
      const skipNotification = 
        req.url.includes('/auth/validate') ||
        req.url.includes('/notifications') ||
        error.status === 401; // Already handled by redirect

      if (!skipNotification) {
        notificationService.showError(errorMessage);
      }

      // Log error details for debugging
      if (error.status >= 500) {
        console.error('Server Error:', {
          url: req.url,
          method: req.method,
          status: error.status,
          message: error.message,
          error: error.error
        });
      }

      return throwError(() => ({
        status: error.status,
        message: errorMessage,
        originalError: error
      }));
    })
  );
};