import { createAction, props } from '@ngrx/store';
import { User } from '@core/models/user.model';

// Auth Actions
export const login = createAction(
  '[Auth] Login',
  props<{ email: string; password: string; rememberMe?: boolean }>()
);

export const loginSuccess = createAction(
  '[Auth] Login Success',
  props<{ user: User; token: string; refreshToken?: string }>()
);

export const loginFailure = createAction(
  '[Auth] Login Failure',
  props<{ error: string }>()
);

export const logout = createAction('[Auth] Logout');

export const logoutSuccess = createAction('[Auth] Logout Success');

export const logoutFailure = createAction(
  '[Auth] Logout Failure',
  props<{ error: string }>()
);

// Registration Actions
export const register = createAction(
  '[Auth] Register',
  props<{ userData: Partial<User>; password: string }>()
);

export const registerSuccess = createAction(
  '[Auth] Register Success',
  props<{ user: User; token: string }>()
);

export const registerFailure = createAction(
  '[Auth] Register Failure',
  props<{ error: string }>()
);

// Token Management
export const refreshToken = createAction('[Auth] Refresh Token');

export const refreshTokenSuccess = createAction(
  '[Auth] Refresh Token Success',
  props<{ token: string; refreshToken?: string }>()
);

export const refreshTokenFailure = createAction(
  '[Auth] Refresh Token Failure',
  props<{ error: string }>()
);

// Password Management
export const forgotPassword = createAction(
  '[Auth] Forgot Password',
  props<{ email: string }>()
);

export const forgotPasswordSuccess = createAction(
  '[Auth] Forgot Password Success'
);

export const forgotPasswordFailure = createAction(
  '[Auth] Forgot Password Failure',
  props<{ error: string }>()
);

export const resetPassword = createAction(
  '[Auth] Reset Password',
  props<{ token: string; newPassword: string }>()
);

export const resetPasswordSuccess = createAction(
  '[Auth] Reset Password Success'
);

export const resetPasswordFailure = createAction(
  '[Auth] Reset Password Failure',
  props<{ error: string }>()
);

// User Profile Actions
export const loadUserProfile = createAction('[Auth] Load User Profile');

export const loadUserProfileSuccess = createAction(
  '[Auth] Load User Profile Success',
  props<{ user: User }>()
);

export const loadUserProfileFailure = createAction(
  '[Auth] Load User Profile Failure',
  props<{ error: string }>()
);

export const updateUserProfile = createAction(
  '[Auth] Update User Profile',
  props<{ updates: Partial<User> }>()
);

export const updateUserProfileSuccess = createAction(
  '[Auth] Update User Profile Success',
  props<{ user: User }>()
);

export const updateUserProfileFailure = createAction(
  '[Auth] Update User Profile Failure',
  props<{ error: string }>()
);

// Session Management
export const checkAuthStatus = createAction('[Auth] Check Auth Status');

export const sessionExpired = createAction('[Auth] Session Expired');

export const sessionExtended = createAction('[Auth] Session Extended');

// Clear Auth Errors
export const clearAuthErrors = createAction('[Auth] Clear Errors');