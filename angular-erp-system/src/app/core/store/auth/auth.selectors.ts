import { createFeatureSelector, createSelector } from '@ngrx/store';
import { AuthState } from './auth.reducer';

// Feature selector
export const selectAuthState = createFeatureSelector<AuthState>('auth');

// Basic selectors
export const selectCurrentUser = createSelector(
  selectAuthState,
  (state: AuthState) => state.user
);

export const selectIsAuthenticated = createSelector(
  selectAuthState,
  (state: AuthState) => state.isAuthenticated
);

export const selectAuthToken = createSelector(
  selectAuthState,
  (state: AuthState) => state.token
);

export const selectRefreshToken = createSelector(
  selectAuthState,
  (state: AuthState) => state.refreshToken
);

export const selectAuthLoading = createSelector(
  selectAuthState,
  (state: AuthState) => state.isLoading
);

export const selectAuthError = createSelector(
  selectAuthState,
  (state: AuthState) => state.error
);

export const selectLastLoginAt = createSelector(
  selectAuthState,
  (state: AuthState) => state.lastLoginAt
);

export const selectSessionExpiresAt = createSelector(
  selectAuthState,
  (state: AuthState) => state.sessionExpiresAt
);

export const selectRememberMe = createSelector(
  selectAuthState,
  (state: AuthState) => state.rememberMe
);

// Computed selectors
export const selectUserRoles = createSelector(
  selectCurrentUser,
  (user) => user?.roles?.map(role => role.name) || []
);

export const selectUserPermissions = createSelector(
  selectCurrentUser,
  (user) => user?.permissions?.map(permission => permission.name) || []
);

export const selectUserFullName = createSelector(
  selectCurrentUser,
  (user) => user ? `${user.firstName} ${user.lastName}` : ''
);

export const selectUserInitials = createSelector(
  selectCurrentUser,
  (user) => user ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}` : ''
);

export const selectIsSessionExpired = createSelector(
  selectSessionExpiresAt,
  (expiresAt) => {
    if (!expiresAt) return false;
    return new Date() > new Date(expiresAt);
  }
);

export const selectTimeUntilExpiry = createSelector(
  selectSessionExpiresAt,
  (expiresAt) => {
    if (!expiresAt) return 0;
    const now = new Date().getTime();
    const expiry = new Date(expiresAt).getTime();
    return Math.max(0, expiry - now);
  }
);

export const selectHasRole = (role: string) => createSelector(
  selectUserRoles,
  (roles) => roles.includes(role)
);

export const selectHasAnyRole = (roles: string[]) => createSelector(
  selectUserRoles,
  (userRoles) => roles.some(role => userRoles.includes(role))
);

export const selectHasAllRoles = (roles: string[]) => createSelector(
  selectUserRoles,
  (userRoles) => roles.every(role => userRoles.includes(role))
);

export const selectHasPermission = (permission: string) => createSelector(
  selectUserPermissions,
  (permissions) => permissions.includes(permission)
);

export const selectHasAnyPermission = (permissions: string[]) => createSelector(
  selectUserPermissions,
  (userPermissions) => permissions.some(permission => userPermissions.includes(permission))
);

export const selectHasAllPermissions = (permissions: string[]) => createSelector(
  selectUserPermissions,
  (userPermissions) => permissions.every(permission => userPermissions.includes(permission))
);

export const selectIsAdmin = createSelector(
  selectUserRoles,
  (roles) => roles.includes('admin')
);

export const selectCanAccessModule = (moduleName: string) => createSelector(
  selectUserRoles,
  selectUserPermissions,
  (roles, permissions) => {
    // Define module access rules
    const moduleAccess: Record<string, { roles?: string[]; permissions?: string[] }> = {
      hr: { roles: ['admin', 'hr_manager', 'hr_employee'] },
      finance: { roles: ['admin', 'finance_manager', 'accountant'] },
      inventory: { roles: ['admin', 'inventory_manager', 'warehouse_employee'] },
      crm: { roles: ['admin', 'sales_manager', 'sales_rep'] },
      projects: { roles: ['admin', 'project_manager', 'team_member'] },
      sales: { roles: ['admin', 'sales_manager', 'sales_rep'] },
      analytics: { roles: ['admin', 'analyst', 'manager'] }
    };

    const access = moduleAccess[moduleName];
    if (!access) return true; // No restrictions

    if (access.roles && access.roles.some(role => roles.includes(role))) {
      return true;
    }

    if (access.permissions && access.permissions.some(permission => permissions.includes(permission))) {
      return true;
    }

    return false;
  }
);