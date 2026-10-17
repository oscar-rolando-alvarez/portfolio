import { HttpClient } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, Subscription, of, timer } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

import { apiUrl, unwrap } from '@core/http/api';
import { User } from '@core/models/user.model';
import * as AuthActions from '@core/store/auth/auth.actions';
import { environment } from '@environments/environment';

export interface LoginResponse {
  user: User;
  token: string;
  refreshToken?: string;
  expiresIn: number;
}

interface RefreshTokenResponse {
  token: string;
  refreshToken?: string;
  expiresIn: number;
}

const STORAGE = { token: 'token', refreshToken: 'refreshToken', user: 'user' } as const;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Thin HTTP + persistence layer for authentication. State transitions are owned
 * by the NgRx auth slice; effects call into this service for I/O.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(Store);
  private refreshTimer?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearRefreshTimer());
  }

  /**
   * Rehydrates a persisted session at startup. The store is populated first so the
   * auth interceptor can attach the token, then the server is asked to confirm it.
   */
  restoreSession(): Observable<void> {
    const token = localStorage.getItem(STORAGE.token);
    const user = this.readStoredUser();
    if (!token || !user) {
      return of(undefined);
    }

    const refreshToken = localStorage.getItem(STORAGE.refreshToken) ?? undefined;
    this.store.dispatch(AuthActions.sessionRestored({ user, token, refreshToken }));

    return this.validateToken().pipe(
      tap((valid) => {
        if (valid) {
          this.scheduleRefresh();
        } else {
          this.clearSession();
          this.store.dispatch(AuthActions.sessionCleared());
        }
      }),
      map(() => undefined),
    );
  }

  login(email: string, password: string, rememberMe = false): Observable<LoginResponse> {
    return this.http.post(apiUrl('auth/login'), { email, password, rememberMe }).pipe(
      map((raw) => unwrap<LoginResponse>(raw)),
      tap((data) => this.scheduleRefresh(data.expiresIn)),
    );
  }

  register(userData: Partial<User>, password: string): Observable<LoginResponse> {
    return this.http
      .post(apiUrl('auth/register'), { ...userData, password })
      .pipe(map((raw) => unwrap<LoginResponse>(raw)));
  }

  logout(): Observable<void> {
    return this.http.post(apiUrl('auth/logout'), {}).pipe(
      map(() => undefined),
      // Even if the server call fails, the local session must be cleared.
      catchError(() => of(undefined)),
      tap(() => {
        this.clearRefreshTimer();
        this.clearSession();
      }),
    );
  }

  refreshToken(): Observable<RefreshTokenResponse> {
    const refreshToken = localStorage.getItem(STORAGE.refreshToken);
    return this.http.post(apiUrl('auth/refresh'), { refreshToken }).pipe(
      map((raw) => unwrap<RefreshTokenResponse>(raw)),
      tap((data) => this.scheduleRefresh(data.expiresIn)),
    );
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post(apiUrl('auth/forgot-password'), { email }).pipe(map(() => undefined));
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http
      .post(apiUrl('auth/reset-password'), { token, newPassword })
      .pipe(map(() => undefined));
  }

  getCurrentUser(): Observable<User> {
    return this.http.get(apiUrl('auth/me')).pipe(map((raw) => unwrap<User>(raw)));
  }

  updateProfile(updates: Partial<User>): Observable<User> {
    return this.http.patch(apiUrl('auth/profile'), updates).pipe(map((raw) => unwrap<User>(raw)));
  }

  validateToken(): Observable<boolean> {
    return this.http.get(apiUrl('auth/validate')).pipe(
      map((raw) => unwrap<{ valid: boolean }>(raw).valid),
      catchError(() => of(false)),
    );
  }

  private scheduleRefresh(expiresIn = environment.security.tokenExpirationTime): void {
    this.clearRefreshTimer();
    const dueIn = Math.max(expiresIn - REFRESH_MARGIN_MS, 30_000);
    this.refreshTimer = timer(dueIn).subscribe(() =>
      this.store.dispatch(AuthActions.refreshToken()),
    );
  }

  private clearRefreshTimer(): void {
    this.refreshTimer?.unsubscribe();
    this.refreshTimer = undefined;
  }

  private readStoredUser(): User | null {
    try {
      const raw = localStorage.getItem(STORAGE.user);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  private clearSession(): void {
    Object.values(STORAGE).forEach((key) => localStorage.removeItem(key));
  }
}
