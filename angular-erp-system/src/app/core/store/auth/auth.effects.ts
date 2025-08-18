import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { map, exhaustMap, catchError, tap, switchMap } from 'rxjs/operators';

import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import * as AuthActions from './auth.actions';

@Injectable()
export class AuthEffects {
  private actions$ = inject(Actions);
  private authService = inject(AuthService);
  private router = inject(Router);
  private store = inject(Store);
  private notificationService = inject(NotificationService);

  // Login Effect
  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      exhaustMap(({ email, password, rememberMe }) =>
        this.authService.login(email, password, rememberMe).pipe(
          map(response => AuthActions.loginSuccess({
            user: response.user,
            token: response.token,
            refreshToken: response.refreshToken
          })),
          catchError(error => of(AuthActions.loginFailure({
            error: error.message || 'Login failed'
          })))
        )
      )
    )
  );

  // Login Success Effect
  loginSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loginSuccess),
      tap(({ user, token, refreshToken }) => {
        // Store tokens
        localStorage.setItem('token', token);
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }
        
        // Store user data
        localStorage.setItem('user', JSON.stringify(user));
        
        // Show success notification
        this.notificationService.showSuccess(`Welcome back, ${user.firstName}!`);
        
        // Navigate to dashboard
        this.router.navigate(['/dashboard']);
      })
    ),
    { dispatch: false }
  );

  // Login Failure Effect
  loginFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loginFailure),
      tap(({ error }) => {
        this.notificationService.showError(error);
      })
    ),
    { dispatch: false }
  );

  // Logout Effect
  logout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logout),
      switchMap(() =>
        this.authService.logout().pipe(
          map(() => AuthActions.logoutSuccess()),
          catchError(error => of(AuthActions.logoutFailure({
            error: error.message || 'Logout failed'
          })))
        )
      )
    )
  );

  // Logout Success Effect
  logoutSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logoutSuccess),
      tap(() => {
        // Clear stored data
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        
        // Show notification
        this.notificationService.showInfo('You have been logged out successfully');
        
        // Navigate to login
        this.router.navigate(['/auth/login']);
      })
    ),
    { dispatch: false }
  );

  // Register Effect
  register$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.register),
      exhaustMap(({ userData, password }) =>
        this.authService.register(userData, password).pipe(
          map(response => AuthActions.registerSuccess({
            user: response.user,
            token: response.token
          })),
          catchError(error => of(AuthActions.registerFailure({
            error: error.message || 'Registration failed'
          })))
        )
      )
    )
  );

  // Register Success Effect
  registerSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.registerSuccess),
      tap(({ user, token }) => {
        // Store tokens
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        
        // Show success notification
        this.notificationService.showSuccess('Registration successful! Welcome to the system.');
        
        // Navigate to dashboard
        this.router.navigate(['/dashboard']);
      })
    ),
    { dispatch: false }
  );

  // Register Failure Effect
  registerFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.registerFailure),
      tap(({ error }) => {
        this.notificationService.showError(error);
      })
    ),
    { dispatch: false }
  );

  // Refresh Token Effect
  refreshToken$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.refreshToken),
      switchMap(() =>
        this.authService.refreshToken().pipe(
          map(response => AuthActions.refreshTokenSuccess({
            token: response.token,
            refreshToken: response.refreshToken
          })),
          catchError(error => of(AuthActions.refreshTokenFailure({
            error: error.message || 'Token refresh failed'
          })))
        )
      )
    )
  );

  // Refresh Token Success Effect
  refreshTokenSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.refreshTokenSuccess),
      tap(({ token, refreshToken }) => {
        localStorage.setItem('token', token);
        if (refreshToken) {
          localStorage.setItem('refreshToken', refreshToken);
        }
      })
    ),
    { dispatch: false }
  );

  // Refresh Token Failure Effect
  refreshTokenFailure$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.refreshTokenFailure),
      tap(() => {
        // Clear stored data and redirect to login
        localStorage.clear();
        this.notificationService.showError('Session expired. Please log in again.');
        this.router.navigate(['/auth/login']);
      })
    ),
    { dispatch: false }
  );

  // Forgot Password Effect
  forgotPassword$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.forgotPassword),
      exhaustMap(({ email }) =>
        this.authService.forgotPassword(email).pipe(
          map(() => AuthActions.forgotPasswordSuccess()),
          catchError(error => of(AuthActions.forgotPasswordFailure({
            error: error.message || 'Failed to send reset email'
          })))
        )
      )
    )
  );

  // Forgot Password Success Effect
  forgotPasswordSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.forgotPasswordSuccess),
      tap(() => {
        this.notificationService.showSuccess('Password reset email sent successfully');
      })
    ),
    { dispatch: false }
  );

  // Reset Password Effect
  resetPassword$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.resetPassword),
      exhaustMap(({ token, newPassword }) =>
        this.authService.resetPassword(token, newPassword).pipe(
          map(() => AuthActions.resetPasswordSuccess()),
          catchError(error => of(AuthActions.resetPasswordFailure({
            error: error.message || 'Password reset failed'
          })))
        )
      )
    )
  );

  // Reset Password Success Effect
  resetPasswordSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.resetPasswordSuccess),
      tap(() => {
        this.notificationService.showSuccess('Password reset successfully. Please log in with your new password.');
        this.router.navigate(['/auth/login']);
      })
    ),
    { dispatch: false }
  );

  // Load User Profile Effect
  loadUserProfile$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loadUserProfile),
      switchMap(() =>
        this.authService.getCurrentUser().pipe(
          map(user => AuthActions.loadUserProfileSuccess({ user })),
          catchError(error => of(AuthActions.loadUserProfileFailure({
            error: error.message || 'Failed to load user profile'
          })))
        )
      )
    )
  );

  // Update User Profile Effect
  updateUserProfile$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.updateUserProfile),
      switchMap(({ updates }) =>
        this.authService.updateProfile(updates).pipe(
          map(user => AuthActions.updateUserProfileSuccess({ user })),
          catchError(error => of(AuthActions.updateUserProfileFailure({
            error: error.message || 'Failed to update profile'
          })))
        )
      )
    )
  );

  // Update User Profile Success Effect
  updateUserProfileSuccess$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.updateUserProfileSuccess),
      tap(({ user }) => {
        localStorage.setItem('user', JSON.stringify(user));
        this.notificationService.showSuccess('Profile updated successfully');
      })
    ),
    { dispatch: false }
  );

  // Session Expired Effect
  sessionExpired$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.sessionExpired),
      tap(() => {
        localStorage.clear();
        this.notificationService.showWarning('Your session has expired. Please log in again.');
        this.router.navigate(['/auth/login']);
      })
    ),
    { dispatch: false }
  );
}