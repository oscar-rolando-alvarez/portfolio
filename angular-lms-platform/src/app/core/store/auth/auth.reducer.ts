import { createReducer, on } from '@ngrx/store';
import { AuthUser } from '../../models/user.model';
import { AuthActions } from './auth.actions';

export interface AuthState {
  // Authentication status
  isAuthenticated: boolean;
  isLoading: boolean;
  isSubmitting: boolean;
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  sessionId: string | null;

  // Error handling
  error: string | null;
  lastError: string | null;
  errorCode: string | null;
  
  // Success messages
  successMessage: string | null;
  
  // Login attempts and security
  loginAttempts: number;
  isAccountLocked: boolean;
  lockoutExpiry: Date | null;
  
  // Two-factor authentication
  requiresTwoFactor: boolean;
  twoFactorEnabled: boolean;
  twoFactorQrCode: string | null;
  backupCodes: string[];
  
  // Session management
  sessionWarning: boolean;
  sessionExpiryWarning: number; // minutes remaining
  lastActivity: Date | null;
  
  // Device and security
  registeredDevices: any[];
  activeSessions: any[];
  securityEvents: any[];
  permissions: string[];
  
  // Password and email management
  emailVerified: boolean;
  emailVerificationSent: boolean;
  passwordResetSent: boolean;
  
  // Biometric authentication
  biometricEnabled: boolean;
  biometricSupported: boolean;
  
  // SSO and social login
  ssoConfig: any;
  socialProviders: string[];
  
  // Risk assessment
  lastRiskScore: number;
  requiresMFA: boolean;
  
  // Account recovery
  recoveryInProgress: boolean;
  recoveryId: string | null;
  recoveryMethod: string | null;
  
  // Audit and compliance
  auditEvents: any[];
  complianceStatus: string | null;
  
  // Feature flags
  features: {
    twoFactorRequired: boolean;
    biometricLogin: boolean;
    ssoEnabled: boolean;
    deviceManagement: boolean;
    sessionManagement: boolean;
    auditLogging: boolean;
  };
}

export const initialState: AuthState = {
  // Authentication status
  isAuthenticated: false,
  isLoading: false,
  isSubmitting: false,
  user: null,
  token: null,
  refreshToken: null,
  tokenExpiry: null,
  sessionId: null,
  
  // Error handling
  error: null,
  lastError: null,
  errorCode: null,
  
  // Success messages
  successMessage: null,
  
  // Login attempts and security
  loginAttempts: 0,
  isAccountLocked: false,
  lockoutExpiry: null,
  
  // Two-factor authentication
  requiresTwoFactor: false,
  twoFactorEnabled: false,
  twoFactorQrCode: null,
  backupCodes: [],
  
  // Session management
  sessionWarning: false,
  sessionExpiryWarning: 0,
  lastActivity: null,
  
  // Device and security
  registeredDevices: [],
  activeSessions: [],
  securityEvents: [],
  permissions: [],
  
  // Password and email management
  emailVerified: false,
  emailVerificationSent: false,
  passwordResetSent: false,
  
  // Biometric authentication
  biometricEnabled: false,
  biometricSupported: false,
  
  // SSO and social login
  ssoConfig: null,
  socialProviders: [],
  
  // Risk assessment
  lastRiskScore: 0,
  requiresMFA: false,
  
  // Account recovery
  recoveryInProgress: false,
  recoveryId: null,
  recoveryMethod: null,
  
  // Audit and compliance
  auditEvents: [],
  complianceStatus: null,
  
  // Feature flags
  features: {
    twoFactorRequired: false,
    biometricLogin: false,
    ssoEnabled: true,
    deviceManagement: true,
    sessionManagement: true,
    auditLogging: true,
  }
};

export const authReducer = createReducer(
  initialState,

  // Login Actions
  on(AuthActions.login, (state) => ({
    ...state,
    isLoading: true,
    isSubmitting: true,
    error: null,
    successMessage: null
  })),

  on(AuthActions.loginSuccess, (state, { user, token, refreshToken }) => ({
    ...state,
    isAuthenticated: true,
    isLoading: false,
    isSubmitting: false,
    user,
    token,
    refreshToken,
    tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    loginAttempts: 0,
    lastActivity: new Date(),
    error: null,
    emailVerified: user.profile?.emailVerified || false
  })),

  on(AuthActions.loginFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    isSubmitting: false,
    error,
    lastError: error,
    loginAttempts: state.loginAttempts + 1,
    isAccountLocked: state.loginAttempts >= 4, // Lock after 5 attempts
    lockoutExpiry: state.loginAttempts >= 4 ? new Date(Date.now() + 15 * 60 * 1000) : null // 15 minutes
  })),

  // Registration Actions
  on(AuthActions.register, (state) => ({
    ...state,
    isLoading: true,
    isSubmitting: true,
    error: null,
    successMessage: null
  })),

  on(AuthActions.registerSuccess, (state, { message }) => ({
    ...state,
    isLoading: false,
    isSubmitting: false,
    successMessage: message,
    emailVerificationSent: true
  })),

  on(AuthActions.registerFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    isSubmitting: false,
    error,
    lastError: error
  })),

  // Social Login Actions
  on(AuthActions.socialLogin, (state) => ({
    ...state,
    isLoading: true,
    isSubmitting: true,
    error: null
  })),

  on(AuthActions.socialLoginSuccess, (state, { user, token, refreshToken }) => ({
    ...state,
    isAuthenticated: true,
    isLoading: false,
    isSubmitting: false,
    user,
    token,
    refreshToken,
    tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastActivity: new Date(),
    error: null
  })),

  on(AuthActions.socialLoginFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    isSubmitting: false,
    error,
    lastError: error
  })),

  // Two-Factor Authentication
  on(AuthActions.verifyTwoFactor, (state) => ({
    ...state,
    isLoading: true,
    isSubmitting: true,
    error: null
  })),

  on(AuthActions.verifyTwoFactorSuccess, (state, { user, token, refreshToken }) => ({
    ...state,
    isAuthenticated: true,
    isLoading: false,
    isSubmitting: false,
    user,
    token,
    refreshToken,
    requiresTwoFactor: false,
    tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastActivity: new Date(),
    error: null
  })),

  on(AuthActions.verifyTwoFactorFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    isSubmitting: false,
    error,
    lastError: error
  })),

  on(AuthActions.enableTwoFactor, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.enableTwoFactorSuccess, (state, { qrCode, backupCodes }) => ({
    ...state,
    isLoading: false,
    twoFactorEnabled: true,
    twoFactorQrCode: qrCode,
    backupCodes,
    successMessage: 'Two-factor authentication has been enabled'
  })),

  on(AuthActions.enableTwoFactorFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  on(AuthActions.disableTwoFactor, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.disableTwoFactorSuccess, (state) => ({
    ...state,
    isLoading: false,
    twoFactorEnabled: false,
    twoFactorQrCode: null,
    backupCodes: [],
    successMessage: 'Two-factor authentication has been disabled'
  })),

  on(AuthActions.disableTwoFactorFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  // Password Management
  on(AuthActions.forgotPassword, (state) => ({
    ...state,
    isLoading: true,
    error: null,
    successMessage: null
  })),

  on(AuthActions.forgotPasswordSuccess, (state, { message }) => ({
    ...state,
    isLoading: false,
    successMessage: message,
    passwordResetSent: true
  })),

  on(AuthActions.forgotPasswordFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  on(AuthActions.resetPassword, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.resetPasswordSuccess, (state, { message }) => ({
    ...state,
    isLoading: false,
    successMessage: message,
    passwordResetSent: false
  })),

  on(AuthActions.resetPasswordFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  on(AuthActions.changePassword, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.changePasswordSuccess, (state, { message }) => ({
    ...state,
    isLoading: false,
    successMessage: message
  })),

  on(AuthActions.changePasswordFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  // Email Verification
  on(AuthActions.sendVerificationEmail, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.sendVerificationEmailSuccess, (state, { message }) => ({
    ...state,
    isLoading: false,
    successMessage: message,
    emailVerificationSent: true
  })),

  on(AuthActions.sendVerificationEmailFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  on(AuthActions.verifyEmail, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.verifyEmailSuccess, (state, { message }) => ({
    ...state,
    isLoading: false,
    successMessage: message,
    emailVerified: true,
    emailVerificationSent: false,
    user: state.user ? { ...state.user, profile: { ...state.user.profile, emailVerified: true } } : null
  })),

  on(AuthActions.verifyEmailFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  // Session Management
  on(AuthActions.checkAuthStatus, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.checkAuthStatusSuccess, (state, { user, token }) => ({
    ...state,
    isAuthenticated: true,
    isLoading: false,
    user,
    token,
    lastActivity: new Date()
  })),

  on(AuthActions.checkAuthStatusFailure, (state, { error }) => ({
    ...state,
    isAuthenticated: false,
    isLoading: false,
    user: null,
    token: null,
    refreshToken: null,
    error,
    lastError: error
  })),

  on(AuthActions.refreshToken, (state) => ({
    ...state,
    isLoading: true
  })),

  on(AuthActions.refreshTokenSuccess, (state, { token, refreshToken }) => ({
    ...state,
    isLoading: false,
    token,
    refreshToken,
    tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    lastActivity: new Date()
  })),

  on(AuthActions.refreshTokenFailure, (state, { error }) => ({
    ...state,
    isAuthenticated: false,
    isLoading: false,
    user: null,
    token: null,
    refreshToken: null,
    error,
    lastError: error
  })),

  // Logout Actions
  on(AuthActions.logout, (state) => ({
    ...state,
    isLoading: true
  })),

  on(AuthActions.logoutSuccess, (state) => ({
    ...initialState,
    features: state.features // Preserve feature flags
  })),

  on(AuthActions.logoutFailure, (state, { error }) => ({
    ...initialState,
    error,
    lastError: error,
    features: state.features
  })),

  on(AuthActions.forceLogout, (state, { reason }) => ({
    ...initialState,
    successMessage: `You have been logged out: ${reason}`,
    features: state.features
  })),

  // Session Security
  on(AuthActions.sessionExpired, (state) => ({
    ...initialState,
    successMessage: 'Your session has expired. Please log in again.',
    features: state.features
  })),

  on(AuthActions.sessionWarning, (state, { minutesRemaining }) => ({
    ...state,
    sessionWarning: true,
    sessionExpiryWarning: minutesRemaining
  })),

  on(AuthActions.extendSession, (state) => ({
    ...state,
    isLoading: true,
    sessionWarning: false
  })),

  on(AuthActions.extendSessionSuccess, (state, { expiresAt }) => ({
    ...state,
    isLoading: false,
    tokenExpiry: expiresAt,
    sessionWarning: false,
    sessionExpiryWarning: 0,
    lastActivity: new Date()
  })),

  on(AuthActions.extendSessionFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  // Device Management
  on(AuthActions.loadUserSessions, (state) => ({
    ...state,
    isLoading: true
  })),

  on(AuthActions.loadUserSessionsSuccess, (state, { sessions }) => ({
    ...state,
    isLoading: false,
    activeSessions: sessions
  })),

  on(AuthActions.loadUserSessionsFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  on(AuthActions.terminateSession, (state) => ({
    ...state,
    isLoading: true
  })),

  on(AuthActions.terminateSessionSuccess, (state, { sessionId }) => ({
    ...state,
    isLoading: false,
    activeSessions: state.activeSessions.filter(session => session.id !== sessionId),
    successMessage: 'Session terminated successfully'
  })),

  on(AuthActions.terminateSessionFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  // Profile Updates
  on(AuthActions.updateProfile, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.updateProfileSuccess, (state, { user }) => ({
    ...state,
    isLoading: false,
    user,
    successMessage: 'Profile updated successfully'
  })),

  on(AuthActions.updateProfileFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  on(AuthActions.uploadAvatar, (state) => ({
    ...state,
    isLoading: true,
    error: null
  })),

  on(AuthActions.uploadAvatarSuccess, (state, { avatarUrl }) => ({
    ...state,
    isLoading: false,
    user: state.user ? { ...state.user, profile: { ...state.user.profile, avatar: avatarUrl } } : null,
    successMessage: 'Avatar updated successfully'
  })),

  on(AuthActions.uploadAvatarFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  // Permissions
  on(AuthActions.loadPermissions, (state) => ({
    ...state,
    isLoading: true
  })),

  on(AuthActions.loadPermissionsSuccess, (state, { permissions }) => ({
    ...state,
    isLoading: false,
    permissions
  })),

  on(AuthActions.loadPermissionsFailure, (state, { error }) => ({
    ...state,
    isLoading: false,
    error,
    lastError: error
  })),

  // Clear States
  on(AuthActions.clearAuthError, (state) => ({
    ...state,
    error: null,
    errorCode: null
  })),

  on(AuthActions.clearAuthSuccess, (state) => ({
    ...state,
    successMessage: null
  })),

  on(AuthActions.resetAuthState, () => initialState),

  // Loading States
  on(AuthActions.setLoading, (state, { isLoading }) => ({
    ...state,
    isLoading
  })),

  on(AuthActions.setSubmitting, (state, { isSubmitting }) => ({
    ...state,
    isSubmitting
  }))
);