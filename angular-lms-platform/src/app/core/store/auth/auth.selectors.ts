import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AuthState } from './auth.reducer';

// Feature selector
export const selectAuthState = createFeatureSelector<AuthState>('auth');

// Basic authentication selectors
export const selectIsAuthenticated = createSelector(
  selectAuthState,
  (state: AuthState) => state.isAuthenticated
);

export const selectCurrentUser = createSelector(
  selectAuthState,
  (state: AuthState) => state.user
);

export const selectAuthToken = createSelector(
  selectAuthState,
  (state: AuthState) => state.token
);

export const selectRefreshToken = createSelector(
  selectAuthState,
  (state: AuthState) => state.refreshToken
);

export const selectTokenExpiry = createSelector(
  selectAuthState,
  (state: AuthState) => state.tokenExpiry
);

// Loading states
export const selectAuthLoading = createSelector(
  selectAuthState,
  (state: AuthState) => state.isLoading
);

export const selectAuthSubmitting = createSelector(
  selectAuthState,
  (state: AuthState) => state.isSubmitting
);

// Error states
export const selectAuthError = createSelector(
  selectAuthState,
  (state: AuthState) => state.error
);

export const selectLastAuthError = createSelector(
  selectAuthState,
  (state: AuthState) => state.lastError
);

export const selectAuthErrorCode = createSelector(
  selectAuthState,
  (state: AuthState) => state.errorCode
);

// Success messages
export const selectAuthSuccessMessage = createSelector(
  selectAuthState,
  (state: AuthState) => state.successMessage
);

// User profile selectors
export const selectUserProfile = createSelector(
  selectCurrentUser,
  (user) => user?.profile
);

export const selectUserRole = createSelector(
  selectCurrentUser,
  (user) => user?.role
);

export const selectUserPermissions = createSelector(
  selectAuthState,
  (state: AuthState) => state.permissions
);

export const selectUserAvatar = createSelector(
  selectUserProfile,
  (profile) => profile?.avatar
);

export const selectUserFullName = createSelector(
  selectUserProfile,
  (profile) => profile ? `${profile.firstName} ${profile.lastName}` : ''
);

// Security selectors
export const selectLoginAttempts = createSelector(
  selectAuthState,
  (state: AuthState) => state.loginAttempts
);

export const selectIsAccountLocked = createSelector(
  selectAuthState,
  (state: AuthState) => state.isAccountLocked
);

export const selectLockoutExpiry = createSelector(
  selectAuthState,
  (state: AuthState) => state.lockoutExpiry
);

// Two-factor authentication selectors
export const selectRequiresTwoFactor = createSelector(
  selectAuthState,
  (state: AuthState) => state.requiresTwoFactor
);

export const selectTwoFactorEnabled = createSelector(
  selectAuthState,
  (state: AuthState) => state.twoFactorEnabled
);

export const selectTwoFactorQrCode = createSelector(
  selectAuthState,
  (state: AuthState) => state.twoFactorQrCode
);

export const selectBackupCodes = createSelector(
  selectAuthState,
  (state: AuthState) => state.backupCodes
);

// Session management selectors
export const selectSessionWarning = createSelector(
  selectAuthState,
  (state: AuthState) => state.sessionWarning
);

export const selectSessionExpiryWarning = createSelector(
  selectAuthState,
  (state: AuthState) => state.sessionExpiryWarning
);

export const selectLastActivity = createSelector(
  selectAuthState,
  (state: AuthState) => state.lastActivity
);

export const selectActiveSessions = createSelector(
  selectAuthState,
  (state: AuthState) => state.activeSessions
);

export const selectRegisteredDevices = createSelector(
  selectAuthState,
  (state: AuthState) => state.registeredDevices
);

// Email verification selectors
export const selectEmailVerified = createSelector(
  selectAuthState,
  (state: AuthState) => state.emailVerified
);

export const selectEmailVerificationSent = createSelector(
  selectAuthState,
  (state: AuthState) => state.emailVerificationSent
);

export const selectPasswordResetSent = createSelector(
  selectAuthState,
  (state: AuthState) => state.passwordResetSent
);

// Biometric authentication selectors
export const selectBiometricEnabled = createSelector(
  selectAuthState,
  (state: AuthState) => state.biometricEnabled
);

export const selectBiometricSupported = createSelector(
  selectAuthState,
  (state: AuthState) => state.biometricSupported
);

// SSO selectors
export const selectSSOConfig = createSelector(
  selectAuthState,
  (state: AuthState) => state.ssoConfig
);

export const selectSocialProviders = createSelector(
  selectAuthState,
  (state: AuthState) => state.socialProviders
);

// Risk assessment selectors
export const selectLastRiskScore = createSelector(
  selectAuthState,
  (state: AuthState) => state.lastRiskScore
);

export const selectRequiresMFA = createSelector(
  selectAuthState,
  (state: AuthState) => state.requiresMFA
);

// Account recovery selectors
export const selectRecoveryInProgress = createSelector(
  selectAuthState,
  (state: AuthState) => state.recoveryInProgress
);

export const selectRecoveryId = createSelector(
  selectAuthState,
  (state: AuthState) => state.recoveryId
);

export const selectRecoveryMethod = createSelector(
  selectAuthState,
  (state: AuthState) => state.recoveryMethod
);

// Audit and compliance selectors
export const selectAuditEvents = createSelector(
  selectAuthState,
  (state: AuthState) => state.auditEvents
);

export const selectComplianceStatus = createSelector(
  selectAuthState,
  (state: AuthState) => state.complianceStatus
);

export const selectSecurityEvents = createSelector(
  selectAuthState,
  (state: AuthState) => state.securityEvents
);

// Feature flags selectors
export const selectAuthFeatures = createSelector(
  selectAuthState,
  (state: AuthState) => state.features
);

export const selectTwoFactorRequired = createSelector(
  selectAuthFeatures,
  (features) => features.twoFactorRequired
);

export const selectBiometricLoginEnabled = createSelector(
  selectAuthFeatures,
  (features) => features.biometricLogin
);

export const selectSSOEnabled = createSelector(
  selectAuthFeatures,
  (features) => features.ssoEnabled
);

export const selectDeviceManagementEnabled = createSelector(
  selectAuthFeatures,
  (features) => features.deviceManagement
);

export const selectSessionManagementEnabled = createSelector(
  selectAuthFeatures,
  (features) => features.sessionManagement
);

export const selectAuditLoggingEnabled = createSelector(
  selectAuthFeatures,
  (features) => features.auditLogging
);

// Complex selectors
export const selectIsTokenExpired = createSelector(
  selectTokenExpiry,
  (expiry) => expiry ? new Date() > expiry : true
);

export const selectSessionTimeRemaining = createSelector(
  selectTokenExpiry,
  (expiry) => {
    if (!expiry) return 0;
    const now = new Date().getTime();
    const expiryTime = expiry.getTime();
    return Math.max(0, Math.floor((expiryTime - now) / (1000 * 60))); // minutes
  }
);

export const selectCanExtendSession = createSelector(
  selectIsAuthenticated,
  selectIsTokenExpired,
  selectSessionTimeRemaining,
  (isAuthenticated, isExpired, timeRemaining) => 
    isAuthenticated && !isExpired && timeRemaining > 0 && timeRemaining <= 15
);

export const selectUserInitials = createSelector(
  selectUserProfile,
  (profile) => {
    if (!profile) return '';
    const firstInitial = profile.firstName?.charAt(0).toUpperCase() || '';
    const lastInitial = profile.lastName?.charAt(0).toUpperCase() || '';
    return `${firstInitial}${lastInitial}`;
  }
);

export const selectUserDisplayName = createSelector(
  selectUserProfile,
  (profile) => {
    if (!profile) return 'User';
    if (profile.firstName && profile.lastName) {
      return `${profile.firstName} ${profile.lastName}`;
    }
    return profile.firstName || profile.lastName || 'User';
  }
);

export const selectHasPermission = (permission: string) => createSelector(
  selectUserPermissions,
  (permissions) => permissions.includes(permission)
);

export const selectHasAnyPermission = (requiredPermissions: string[]) => createSelector(
  selectUserPermissions,
  (permissions) => requiredPermissions.some(permission => permissions.includes(permission))
);

export const selectHasAllPermissions = (requiredPermissions: string[]) => createSelector(
  selectUserPermissions,
  (permissions) => requiredPermissions.every(permission => permissions.includes(permission))
);

export const selectCanAccessAdminPanel = createSelector(
  selectUserRole,
  selectUserPermissions,
  (role, permissions) => 
    role === 'admin' || 
    role === 'super_admin' || 
    permissions.includes('access_admin_panel')
);

export const selectCanCreateCourse = createSelector(
  selectUserRole,
  selectUserPermissions,
  (role, permissions) => 
    role === 'instructor' || 
    role === 'admin' || 
    role === 'super_admin' || 
    permissions.includes('create_course')
);

export const selectCanManageUsers = createSelector(
  selectUserRole,
  selectUserPermissions,
  (role, permissions) => 
    role === 'admin' || 
    role === 'super_admin' || 
    permissions.includes('manage_users')
);

export const selectSecurityStatus = createSelector(
  selectTwoFactorEnabled,
  selectEmailVerified,
  selectBiometricEnabled,
  selectLastRiskScore,
  (twoFactor, emailVerified, biometric, riskScore) => ({
    twoFactorEnabled: twoFactor,
    emailVerified,
    biometricEnabled: biometric,
    riskScore,
    securityLevel: (() => {
      let level = 0;
      if (emailVerified) level += 1;
      if (twoFactor) level += 2;
      if (biometric) level += 1;
      if (riskScore < 30) level += 1;
      
      if (level >= 4) return 'high';
      if (level >= 2) return 'medium';
      return 'low';
    })()
  })
);

export const selectAuthSummary = createSelector(
  selectIsAuthenticated,
  selectCurrentUser,
  selectAuthLoading,
  selectAuthError,
  selectSessionTimeRemaining,
  selectSecurityStatus,
  (isAuthenticated, user, isLoading, error, timeRemaining, securityStatus) => ({
    isAuthenticated,
    user,
    isLoading,
    error,
    sessionTimeRemaining: timeRemaining,
    securityStatus,
    needsAttention: !securityStatus.emailVerified || securityStatus.securityLevel === 'low'
  })
);