import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, timer } from 'rxjs';
import { map, tap, catchError, switchMap } from 'rxjs/operators';
import { Store } from '@ngrx/store';

import { environment } from '@environments/environment';
import { User } from '@core/models/user.model';
import { ApiResponse } from '@core/models/base.model';
import * as AuthActions from '@core/store/auth/auth.actions';

interface LoginResponse {
  user: User;
  token: string;
  refreshToken?: string;
  expiresIn: number;
}

interface RegisterResponse {
  user: User;
  token: string;
  expiresIn: number;
}

interface RefreshTokenResponse {
  token: string;
  refreshToken?: string;
  expiresIn: number;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private store = inject(Store);
  
  private readonly apiUrl = `${environment.apiUrl}/${environment.apiVersion}/auth`;
  private tokenRefreshTimer?: any;

  constructor() {
    // Initialize token refresh timer if user is logged in
    this.initializeTokenRefresh();
  }

  initializeAuth(): void {
    const token = this.getStoredToken();
    const user = this.getStoredUser();
    
    if (token && user) {
      // Validate token and load user
      this.validateToken().subscribe({
        next: (isValid) => {
          if (isValid) {
            this.store.dispatch(AuthActions.loginSuccess({ user, token }));
            this.setupTokenRefresh();
          } else {
            this.clearStoredData();
          }
        },
        error: () => {
          this.clearStoredData();
        }
      });
    }
  }

  login(email: string, password: string, rememberMe = false): Observable<LoginResponse> {
    return this.http.post<ApiResponse<LoginResponse>>(`${this.apiUrl}/login`, {
      email,
      password,
      rememberMe
    }).pipe(
      map(response => response.data!),
      tap(data => this.setupTokenRefresh(data.expiresIn)),
      catchError(this.handleError)
    );
  }

  register(userData: Partial<User>, password: string): Observable<RegisterResponse> {
    return this.http.post<ApiResponse<RegisterResponse>>(`${this.apiUrl}/register`, {
      ...userData,
      password
    }).pipe(
      map(response => response.data!),
      tap(data => this.setupTokenRefresh(data.expiresIn)),
      catchError(this.handleError)
    );
  }

  logout(): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${this.apiUrl}/logout`, {}).pipe(
      map(() => void 0),
      tap(() => {
        this.clearTokenRefreshTimer();
        this.clearStoredData();
      }),
      catchError(() => {
        // Even if logout fails on server, clear local data
        this.clearTokenRefreshTimer();
        this.clearStoredData();
        return [];
      })
    );
  }

  refreshToken(): Observable<RefreshTokenResponse> {
    const refreshToken = localStorage.getItem('refreshToken');
    
    return this.http.post<ApiResponse<RefreshTokenResponse>>(`${this.apiUrl}/refresh`, {
      refreshToken
    }).pipe(
      map(response => response.data!),
      tap(data => {
        localStorage.setItem('token', data.token);
        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }
        this.setupTokenRefresh(data.expiresIn);
      }),
      catchError(this.handleError)
    );
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${this.apiUrl}/forgot-password`, { email }).pipe(
      map(() => void 0),
      catchError(this.handleError)
    );
  }

  resetPassword(token: string, newPassword: string): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${this.apiUrl}/reset-password`, {
      token,
      newPassword
    }).pipe(
      map(() => void 0),
      catchError(this.handleError)
    );
  }

  getCurrentUser(): Observable<User> {
    return this.http.get<ApiResponse<User>>(`${this.apiUrl}/me`).pipe(
      map(response => response.data!),
      catchError(this.handleError)
    );
  }

  updateProfile(updates: Partial<User>): Observable<User> {
    return this.http.patch<ApiResponse<User>>(`${this.apiUrl}/profile`, updates).pipe(
      map(response => response.data!),
      catchError(this.handleError)
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<ApiResponse<void>>(`${this.apiUrl}/change-password`, {
      currentPassword,
      newPassword
    }).pipe(
      map(() => void 0),
      catchError(this.handleError)
    );
  }

  validateToken(): Observable<boolean> {
    return this.http.get<ApiResponse<{ valid: boolean }>>(`${this.apiUrl}/validate`).pipe(
      map(response => response.data?.valid || false),
      catchError(() => [false])
    );
  }

  // Helper methods
  private setupTokenRefresh(expiresIn?: number): void {
    this.clearTokenRefreshTimer();
    
    const tokenExpiresIn = expiresIn || environment.security.tokenExpirationTime;
    const refreshTime = tokenExpiresIn - (5 * 60 * 1000); // Refresh 5 minutes before expiry
    
    this.tokenRefreshTimer = timer(refreshTime).subscribe(() => {
      this.store.dispatch(AuthActions.refreshToken());
    });
  }

  private initializeTokenRefresh(): void {
    const token = this.getStoredToken();
    if (token) {
      // In a real implementation, you'd decode the JWT to get expiration time
      this.setupTokenRefresh();
    }
  }

  private clearTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) {
      this.tokenRefreshTimer.unsubscribe();
      this.tokenRefreshTimer = null;
    }
  }

  private getStoredToken(): string | null {
    return localStorage.getItem('token');
  }

  private getStoredUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  private clearStoredData(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }

  private handleError = (error: any) => {
    console.error('Auth Service Error:', error);
    throw error;
  };

  // Public getters for components
  get isAuthenticated(): boolean {
    return !!this.getStoredToken();
  }

  get currentUser(): User | null {
    return this.getStoredUser();
  }
}