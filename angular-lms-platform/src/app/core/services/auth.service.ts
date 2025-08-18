import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, timer, of } from 'rxjs';
import { map, catchError, tap, switchMap, retry, shareReplay } from 'rxjs/operators';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';

// Models
import { 
  AuthUser, 
  CreateUserRequest, 
  ResetPasswordRequest, 
  ChangePasswordRequest,
  UserSession 
} from '../models/user.model';

// Store
import { AppState } from '../store/app.state';
import { AuthActions } from '../store/auth/auth.actions';

// Services
import { NotificationService } from './notification.service';
import { AnalyticsService } from './analytics.service';
import { CryptoService } from './crypto.service';

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  deviceInfo?: any;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
  refreshToken: string;
  requiresTwoFactor?: boolean;
  twoFactorToken?: string;
}

export interface SocialLoginRequest {
  provider: string;
  token: string;
  deviceInfo?: any;
}

export interface TwoFactorRequest {
  code: string;
  token: string;
  rememberDevice?: boolean;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  browser: string;
  os: string;
  ipAddress: string;
  userAgent: string;
  fingerprint: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly store = inject(Store<AppState>);
  private readonly notificationService = inject(NotificationService);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly cryptoService = inject(CryptoService);

  private readonly baseUrl = '/api/v1/auth';
  private readonly tokenKey = 'auth_token';
  private readonly refreshTokenKey = 'refresh_token';
  private readonly deviceKey = 'device_info';

  // Token management
  private tokenRefreshSubject = new BehaviorSubject<string | null>(null);
  private isRefreshing = false;

  // Session management
  private sessionCheckInterval: any;
  private readonly sessionCheckIntervalMs = 60000; // 1 minute

  // Biometric authentication
  private biometricSupported$ = new BehaviorSubject<boolean>(false);

  constructor() {
    this.initializeService();
  }

  // Authentication Methods
  login(credentials: LoginRequest): Observable<LoginResponse> {
    const deviceInfo = this.getDeviceInfo();
    const loginData = {
      ...credentials,
      deviceInfo,
      fingerprint: this.generateDeviceFingerprint()
    };

    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, loginData)
      .pipe(
        tap(response => {
          if (!response.requiresTwoFactor) {
            this.setTokens(response.token, response.refreshToken);
            this.scheduleTokenRefresh(response.token);
            this.startSessionMonitoring();
            this.analyticsService.trackLogin('email', true);
          }
        }),
        catchError(this.handleError.bind(this))
      );
  }

  register(userData: CreateUserRequest): Observable<{ message: string }> {
    const deviceInfo = this.getDeviceInfo();
    const registrationData = {
      ...userData,
      deviceInfo,
      fingerprint: this.generateDeviceFingerprint()
    };

    return this.http.post<{ message: string }>(`${this.baseUrl}/register`, registrationData)
      .pipe(
        tap(() => {
          this.analyticsService.trackRegistration('email');
        }),
        catchError(this.handleError.bind(this))
      );
  }

  socialLogin(request: SocialLoginRequest): Observable<LoginResponse> {
    const deviceInfo = this.getDeviceInfo();
    const socialLoginData = {
      ...request,
      deviceInfo,
      fingerprint: this.generateDeviceFingerprint()
    };

    return this.http.post<LoginResponse>(`${this.baseUrl}/social-login`, socialLoginData)
      .pipe(
        tap(response => {
          this.setTokens(response.token, response.refreshToken);
          this.scheduleTokenRefresh(response.token);
          this.startSessionMonitoring();
          this.analyticsService.trackLogin(request.provider, true);
        }),
        catchError(this.handleError.bind(this))
      );
  }

  verifyTwoFactor(request: TwoFactorRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/verify-2fa`, request)
      .pipe(
        tap(response => {
          this.setTokens(response.token, response.refreshToken);
          this.scheduleTokenRefresh(response.token);
          this.startSessionMonitoring();
          this.analyticsService.trackLogin('2fa', true);
        }),
        catchError(this.handleError.bind(this))
      );
  }

  logout(): Observable<void> {
    const refreshToken = this.getRefreshToken();
    
    return this.http.post<void>(`${this.baseUrl}/logout`, { refreshToken })
      .pipe(
        tap(() => {
          this.clearTokens();
          this.stopSessionMonitoring();
          this.analyticsService.trackLogout();
        }),
        catchError(() => {
          // Even if logout fails on server, clear local tokens
          this.clearTokens();
          this.stopSessionMonitoring();
          return of(null);
        })
      );
  }

  refreshToken(): Observable<{ token: string; refreshToken: string }> {
    const refreshToken = this.getRefreshToken();
    
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing) {
      return this.tokenRefreshSubject.asObservable().pipe(
        switchMap(token => token ? of({ token, refreshToken: token }) : throwError(() => new Error('Token refresh failed')))
      );
    }

    this.isRefreshing = true;

    return this.http.post<{ token: string; refreshToken: string }>(`${this.baseUrl}/refresh`, { refreshToken })
      .pipe(
        tap(response => {
          this.setTokens(response.token, response.refreshToken);
          this.scheduleTokenRefresh(response.token);
          this.tokenRefreshSubject.next(response.token);
          this.isRefreshing = false;
        }),
        catchError(error => {
          this.isRefreshing = false;
          this.tokenRefreshSubject.next(null);
          this.clearTokens();
          this.router.navigate(['/auth/login']);
          return throwError(() => error);
        })
      );
  }

  // Password Management
  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/forgot-password`, { email })
      .pipe(
        tap(() => {
          this.analyticsService.trackEvent('password_reset_requested');
        }),
        catchError(this.handleError.bind(this))
      );
  }

  resetPassword(resetData: ResetPasswordRequest): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/reset-password`, resetData)
      .pipe(
        tap(() => {
          this.analyticsService.trackEvent('password_reset_completed');
        }),
        catchError(this.handleError.bind(this))
      );
  }

  changePassword(passwordData: ChangePasswordRequest): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.baseUrl}/change-password`, passwordData)
      .pipe(
        tap(() => {
          this.analyticsService.trackEvent('password_changed');
        }),
        catchError(this.handleError.bind(this))
      );
  }

  // Email Verification
  sendVerificationEmail(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/send-verification`, {})
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

  verifyEmail(token: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/verify-email`, { token })
      .pipe(
        tap(() => {
          this.analyticsService.trackEvent('email_verified');
        }),
        catchError(this.handleError.bind(this))
      );
  }

  // Two-Factor Authentication
  enableTwoFactor(): Observable<{ qrCode: string; backupCodes: string[] }> {
    return this.http.post<{ qrCode: string; backupCodes: string[] }>(`${this.baseUrl}/enable-2fa`, {})
      .pipe(
        tap(() => {
          this.analyticsService.trackEvent('2fa_enabled');
        }),
        catchError(this.handleError.bind(this))
      );
  }

  disableTwoFactor(password: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/disable-2fa`, { password })
      .pipe(
        tap(() => {
          this.analyticsService.trackEvent('2fa_disabled');
        }),
        catchError(this.handleError.bind(this))
      );
  }

  // Session Management
  checkAuthStatus(): Observable<{ user: AuthUser; token: string }> {
    return this.http.get<{ user: AuthUser; token: string }>(`${this.baseUrl}/me`)
      .pipe(
        retry(2),
        catchError(this.handleError.bind(this))
      );
  }

  getUserSessions(): Observable<UserSession[]> {
    return this.http.get<UserSession[]>(`${this.baseUrl}/sessions`)
      .pipe(
        catchError(this.handleError.bind(this))
      );
  }

  terminateSession(sessionId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sessions/${sessionId}`)
      .pipe(
        tap(() => {
          this.analyticsService.trackEvent('session_terminated', { sessionId });
        }),
        catchError(this.handleError.bind(this))
      );
  }

  extendSession(): Observable<{ expiresAt: Date }> {
    return this.http.post<{ expiresAt: string }>(`${this.baseUrl}/extend-session`, {})
      .pipe(
        map(response => ({ expiresAt: new Date(response.expiresAt) })),
        catchError(this.handleError.bind(this))
      );
  }

  // Biometric Authentication
  isBiometricSupported(): Observable<boolean> {
    return this.biometricSupported$.asObservable();
  }

  enableBiometricAuth(): Observable<void> {
    if (!('credentials' in navigator)) {
      return throwError(() => new Error('Biometric authentication not supported'));
    }

    return new Observable(observer => {
      navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'EduPlatform' },
          user: {
            id: crypto.getRandomValues(new Uint8Array(64)),
            name: 'user@example.com',
            displayName: 'User'
          },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required'
          }
        }
      } as any).then(credential => {
        // Store credential and enable biometric auth
        localStorage.setItem('biometric_credential', JSON.stringify(credential));
        this.analyticsService.trackEvent('biometric_auth_enabled');
        observer.next();
        observer.complete();
      }).catch(error => {
        observer.error(error);
      });
    });
  }

  authenticateWithBiometric(): Observable<LoginResponse> {
    return new Observable(observer => {
      const storedCredential = localStorage.getItem('biometric_credential');
      if (!storedCredential) {
        observer.error(new Error('No biometric credential found'));
        return;
      }

      navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{
            id: JSON.parse(storedCredential).rawId,
            type: 'public-key'
          }],
          userVerification: 'required'
        }
      } as any).then(assertion => {
        // Verify assertion with server
        this.http.post<LoginResponse>(`${this.baseUrl}/biometric-login`, { assertion })
          .pipe(
            tap(response => {
              this.setTokens(response.token, response.refreshToken);
              this.scheduleTokenRefresh(response.token);
              this.startSessionMonitoring();
              this.analyticsService.trackLogin('biometric', true);
            })
          )
          .subscribe({
            next: response => {
              observer.next(response);
              observer.complete();
            },
            error: error => observer.error(error)
          });
      }).catch(error => {
        observer.error(error);
      });
    });
  }

  // Utility Methods
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  isTokenExpired(token?: string): boolean {
    const authToken = token || this.getToken();
    if (!authToken) return true;

    try {
      const payload = JSON.parse(atob(authToken.split('.')[1]));
      const exp = payload.exp * 1000; // Convert to milliseconds
      return Date.now() >= exp;
    } catch {
      return true;
    }
  }

  getTokenExpirationDate(token?: string): Date | null {
    const authToken = token || this.getToken();
    if (!authToken) return null;

    try {
      const payload = JSON.parse(atob(authToken.split('.')[1]));
      return new Date(payload.exp * 1000);
    } catch {
      return null;
    }
  }

  // Private Methods
  private initializeService(): void {
    this.checkBiometricSupport();
    this.setupTokenRefreshOnStartup();
  }

  private checkBiometricSupport(): void {
    if ('credentials' in navigator && 'PublicKeyCredential' in window) {
      (window as any).PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((available: boolean) => {
          this.biometricSupported$.next(available);
        })
        .catch(() => {
          this.biometricSupported$.next(false);
        });
    } else {
      this.biometricSupported$.next(false);
    }
  }

  private setupTokenRefreshOnStartup(): void {
    const token = this.getToken();
    if (token && !this.isTokenExpired(token)) {
      this.scheduleTokenRefresh(token);
      this.startSessionMonitoring();
    }
  }

  private setTokens(token: string, refreshToken: string): void {
    localStorage.setItem(this.tokenKey, token);
    localStorage.setItem(this.refreshTokenKey, refreshToken);
  }

  private clearTokens(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.deviceKey);
  }

  private scheduleTokenRefresh(token: string): void {
    const expirationDate = this.getTokenExpirationDate(token);
    if (!expirationDate) return;

    // Refresh token 5 minutes before expiration
    const refreshTime = expirationDate.getTime() - Date.now() - (5 * 60 * 1000);
    
    if (refreshTime > 0) {
      timer(refreshTime).subscribe(() => {
        this.store.dispatch(AuthActions.refreshToken());
      });
    }
  }

  private startSessionMonitoring(): void {
    this.stopSessionMonitoring();
    
    this.sessionCheckInterval = setInterval(() => {
      const token = this.getToken();
      if (token) {
        const expirationDate = this.getTokenExpirationDate(token);
        if (expirationDate) {
          const timeRemaining = expirationDate.getTime() - Date.now();
          const minutesRemaining = Math.floor(timeRemaining / (1000 * 60));
          
          // Warn when 15 minutes remaining
          if (minutesRemaining <= 15 && minutesRemaining > 0) {
            this.store.dispatch(AuthActions.sessionWarning({ minutesRemaining }));
          }
          
          // Auto-logout when expired
          if (minutesRemaining <= 0) {
            this.store.dispatch(AuthActions.sessionExpired());
          }
        }
      }
    }, this.sessionCheckIntervalMs);
  }

  private stopSessionMonitoring(): void {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
  }

  private getDeviceInfo(): DeviceInfo {
    const stored = localStorage.getItem(this.deviceKey);
    if (stored) {
      return JSON.parse(stored);
    }

    const deviceInfo: DeviceInfo = {
      deviceId: this.generateDeviceId(),
      deviceName: this.getDeviceName(),
      deviceType: this.getDeviceType(),
      browser: this.getBrowserName(),
      os: this.getOperatingSystem(),
      ipAddress: '', // Will be determined by server
      userAgent: navigator.userAgent,
      fingerprint: this.generateDeviceFingerprint()
    };

    localStorage.setItem(this.deviceKey, JSON.stringify(deviceInfo));
    return deviceInfo;
  }

  private generateDeviceId(): string {
    return this.cryptoService.generateUUID();
  }

  private generateDeviceFingerprint(): string {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.platform,
      navigator.cookieEnabled
    ];
    
    return this.cryptoService.hash(components.join('|'));
  }

  private getDeviceName(): string {
    const ua = navigator.userAgent;
    if (/Mobile|Android|iPhone|iPad/.test(ua)) {
      return 'Mobile Device';
    } else if (/Tablet/.test(ua)) {
      return 'Tablet';
    } else {
      return 'Desktop Computer';
    }
  }

  private getDeviceType(): string {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    if (/Android/.test(ua)) return 'Android';
    if (/Windows/.test(ua)) return 'Windows';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown';
  }

  private getBrowserName(): string {
    const ua = navigator.userAgent;
    if (/Chrome/.test(ua)) return 'Chrome';
    if (/Firefox/.test(ua)) return 'Firefox';
    if (/Safari/.test(ua) && !/Chrome/.test(ua)) return 'Safari';
    if (/Edge/.test(ua)) return 'Edge';
    if (/Opera/.test(ua)) return 'Opera';
    return 'Unknown';
  }

  private getOperatingSystem(): string {
    const ua = navigator.userAgent;
    if (/Windows NT 10/.test(ua)) return 'Windows 10';
    if (/Windows NT 6.3/.test(ua)) return 'Windows 8.1';
    if (/Windows NT 6.2/.test(ua)) return 'Windows 8';
    if (/Windows NT 6.1/.test(ua)) return 'Windows 7';
    if (/Mac OS X/.test(ua)) return 'macOS';
    if (/Linux/.test(ua)) return 'Linux';
    if (/Android/.test(ua)) return 'Android';
    if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
    return 'Unknown';
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An unexpected error occurred';
    
    if (error.error instanceof ErrorEvent) {
      // Client-side error
      errorMessage = error.error.message;
    } else {
      // Server-side error
      if (error.status === 401) {
        errorMessage = 'Invalid credentials';
        this.clearTokens();
        this.router.navigate(['/auth/login']);
      } else if (error.status === 403) {
        errorMessage = 'Access denied';
      } else if (error.status === 429) {
        errorMessage = 'Too many attempts. Please try again later';
      } else if (error.status >= 500) {
        errorMessage = 'Server error. Please try again later';
      } else if (error.error?.message) {
        errorMessage = error.error.message;
      }
    }

    this.analyticsService.trackError(error);
    return throwError(() => new Error(errorMessage));
  }
}