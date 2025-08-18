import { createReducer, on } from '@ngrx/store';
import { User } from '@core/models/user.model';
import * as AuthActions from './auth.actions';

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  lastLoginAt: Date | null;
  sessionExpiresAt: Date | null;
  rememberMe: boolean;
}

export const initialState: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  lastLoginAt: null,
  sessionExpiresAt: null,
  rememberMe: false
};

export const authReducer = createReducer(
  initialState,

  // Login Actions
  on(AuthActions.login, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.loginSuccess, (state, { user, token, refreshToken }) => ({
    ...state,
    user,
    token,
    refreshToken: refreshToken || state.refreshToken,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    lastLoginAt: new Date(),
    sessionExpiresAt: new Date(Date.now() + (60 * 60 * 1000)) // 1 hour from now
  })),

  on(AuthActions.loginFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    isAuthenticated: false,
    user: null,
    token: null,
    refreshToken: null
  })),

  // Logout Actions
  on(AuthActions.logout, (state) => ({
    ...state,
    isLoading: true
  })),

  on(AuthActions.logoutSuccess, () => ({
    ...initialState
  })),

  on(AuthActions.logoutFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error
  })),

  // Registration Actions
  on(AuthActions.register, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.registerSuccess, (state, { user, token }) => ({
    ...state,
    user,
    token,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    lastLoginAt: new Date(),
    sessionExpiresAt: new Date(Date.now() + (60 * 60 * 1000))
  })),

  on(AuthActions.registerFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    isAuthenticated: false
  })),

  // Token Refresh Actions
  on(AuthActions.refreshToken, (state) => ({
    ...state,
    isLoading: true
  })),

  on(AuthActions.refreshTokenSuccess, (state, { token, refreshToken }) => ({
    ...state,
    token,
    refreshToken: refreshToken || state.refreshToken,
    isLoading: false,
    sessionExpiresAt: new Date(Date.now() + (60 * 60 * 1000))
  })),

  on(AuthActions.refreshTokenFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    isAuthenticated: false,
    user: null,
    token: null,
    refreshToken: null
  })),

  // Password Management Actions
  on(AuthActions.forgotPassword, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.forgotPasswordSuccess, (state) => ({
    ...state,
    isLoading: false,
    error: null
  })),

  on(AuthActions.forgotPasswordFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error
  })),

  on(AuthActions.resetPassword, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.resetPasswordSuccess, (state) => ({
    ...state,
    isLoading: false,
    error: null
  })),

  on(AuthActions.resetPasswordFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error
  })),

  // User Profile Actions
  on(AuthActions.loadUserProfile, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.loadUserProfileSuccess, (state, { user }) => ({
    ...state,
    user,
    isLoading: false,
    error: null
  })),

  on(AuthActions.loadUserProfileFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error
  })),

  on(AuthActions.updateUserProfile, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.updateUserProfileSuccess, (state, { user }) => ({
    ...state,
    user,
    isLoading: false,
    error: null
  })),

  on(AuthActions.updateUserProfileFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error
  })),

  // Session Management
  on(AuthActions.sessionExpired, (state) => ({
    ...initialState,
    error: 'Your session has expired. Please log in again.'
  })),

  on(AuthActions.sessionExtended, (state) => ({
    ...state,
    sessionExpiresAt: new Date(Date.now() + (60 * 60 * 1000))
  })),

  // Clear Errors
  on(AuthActions.clearAuthErrors, (state) => ({
    ...state,
    error: null
  }))
);