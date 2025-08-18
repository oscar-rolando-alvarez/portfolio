import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { AuthUser, CreateUserRequest, ResetPasswordRequest, ChangePasswordRequest } from '../../models/user.model';

export const AuthActions = createActionGroup({
  source: 'Auth',
  events: {
    // Login Actions
    'Login': props<{ email: string; password: string; rememberMe?: boolean }>(),
    'Login Success': props<{ user: AuthUser; token: string; refreshToken: string }>(),
    'Login Failure': props<{ error: string }>(),

    // Registration Actions
    'Register': props<{ userData: CreateUserRequest }>(),
    'Register Success': props<{ message: string }>(),
    'Register Failure': props<{ error: string }>(),

    // Social Login Actions
    'Social Login': props<{ provider: string; token: string }>(),
    'Social Login Success': props<{ user: AuthUser; token: string; refreshToken: string }>(),
    'Social Login Failure': props<{ error: string }>(),

    // Two-Factor Authentication
    'Verify Two Factor': props<{ code: string; token: string }>(),
    'Verify Two Factor Success': props<{ user: AuthUser; token: string; refreshToken: string }>(),
    'Verify Two Factor Failure': props<{ error: string }>(),

    'Enable Two Factor': emptyProps(),
    'Enable Two Factor Success': props<{ qrCode: string; backupCodes: string[] }>(),
    'Enable Two Factor Failure': props<{ error: string }>(),

    'Disable Two Factor': props<{ password: string }>(),
    'Disable Two Factor Success': emptyProps(),
    'Disable Two Factor Failure': props<{ error: string }>(),

    // Password Management
    'Forgot Password': props<{ email: string }>(),
    'Forgot Password Success': props<{ message: string }>(),
    'Forgot Password Failure': props<{ error: string }>(),

    'Reset Password': props<{ resetData: ResetPasswordRequest }>(),
    'Reset Password Success': props<{ message: string }>(),
    'Reset Password Failure': props<{ error: string }>(),

    'Change Password': props<{ passwordData: ChangePasswordRequest }>(),
    'Change Password Success': props<{ message: string }>(),
    'Change Password Failure': props<{ error: string }>(),

    // Email Verification
    'Send Verification Email': emptyProps(),
    'Send Verification Email Success': props<{ message: string }>(),
    'Send Verification Email Failure': props<{ error: string }>(),

    'Verify Email': props<{ token: string }>(),
    'Verify Email Success': props<{ message: string }>(),
    'Verify Email Failure': props<{ error: string }>(),

    // Session Management
    'Check Auth Status': emptyProps(),
    'Check Auth Status Success': props<{ user: AuthUser; token: string }>(),
    'Check Auth Status Failure': props<{ error: string }>(),

    'Refresh Token': emptyProps(),
    'Refresh Token Success': props<{ token: string; refreshToken: string }>(),
    'Refresh Token Failure': props<{ error: string }>(),

    'Logout': emptyProps(),
    'Logout Success': emptyProps(),
    'Logout Failure': props<{ error: string }>(),

    'Force Logout': props<{ reason: string }>(),

    // Session Security
    'Session Expired': emptyProps(),
    'Session Warning': props<{ minutesRemaining: number }>(),
    'Extend Session': emptyProps(),
    'Extend Session Success': props<{ expiresAt: Date }>(),
    'Extend Session Failure': props<{ error: string }>(),

    // Account Security
    'Lock Account': props<{ reason: string }>(),
    'Unlock Account': props<{ token: string }>(),
    'Unlock Account Success': props<{ message: string }>(),
    'Unlock Account Failure': props<{ error: string }>(),

    'Report Suspicious Activity': props<{ details: any }>(),
    'Report Suspicious Activity Success': emptyProps(),
    'Report Suspicious Activity Failure': props<{ error: string }>(),

    // Device Management
    'Register Device': props<{ deviceInfo: any }>(),
    'Register Device Success': props<{ deviceId: string }>(),
    'Register Device Failure': props<{ error: string }>(),

    'Revoke Device': props<{ deviceId: string }>(),
    'Revoke Device Success': props<{ deviceId: string }>(),
    'Revoke Device Failure': props<{ error: string }>(),

    'Load User Sessions': emptyProps(),
    'Load User Sessions Success': props<{ sessions: any[] }>(),
    'Load User Sessions Failure': props<{ error: string }>(),

    'Terminate Session': props<{ sessionId: string }>(),
    'Terminate Session Success': props<{ sessionId: string }>(),
    'Terminate Session Failure': props<{ error: string }>(),

    // Profile Updates (Auth-related)
    'Update Profile': props<{ profileData: any }>(),
    'Update Profile Success': props<{ user: AuthUser }>(),
    'Update Profile Failure': props<{ error: string }>(),

    'Upload Avatar': props<{ file: File }>(),
    'Upload Avatar Success': props<{ avatarUrl: string }>(),
    'Upload Avatar Failure': props<{ error: string }>(),

    // Permissions and Roles
    'Load Permissions': emptyProps(),
    'Load Permissions Success': props<{ permissions: string[] }>(),
    'Load Permissions Failure': props<{ error: string }>(),

    'Check Permission': props<{ permission: string }>(),
    'Check Permission Success': props<{ hasPermission: boolean }>(),
    'Check Permission Failure': props<{ error: string }>(),

    // Account Settings
    'Update Email': props<{ newEmail: string; password: string }>(),
    'Update Email Success': props<{ message: string }>(),
    'Update Email Failure': props<{ error: string }>(),

    'Confirm Email Change': props<{ token: string }>(),
    'Confirm Email Change Success': props<{ newEmail: string }>(),
    'Confirm Email Change Failure': props<{ error: string }>(),

    'Delete Account': props<{ password: string; reason?: string }>(),
    'Delete Account Success': props<{ message: string }>(),
    'Delete Account Failure': props<{ error: string }>(),

    'Export Account Data': emptyProps(),
    'Export Account Data Success': props<{ downloadUrl: string }>(),
    'Export Account Data Failure': props<{ error: string }>(),

    // Security Events
    'Log Security Event': props<{ event: any }>(),
    'Load Security Events': emptyProps(),
    'Load Security Events Success': props<{ events: any[] }>(),
    'Load Security Events Failure': props<{ error: string }>(),

    // Clear States
    'Clear Auth Error': emptyProps(),
    'Clear Auth Success': emptyProps(),
    'Reset Auth State': emptyProps(),

    // Loading States
    'Set Loading': props<{ isLoading: boolean }>(),
    'Set Submitting': props<{ isSubmitting: boolean }>(),

    // Biometric Authentication (Future Enhancement)
    'Enable Biometric Auth': emptyProps(),
    'Enable Biometric Auth Success': emptyProps(),
    'Enable Biometric Auth Failure': props<{ error: string }>(),

    'Authenticate Biometric': emptyProps(),
    'Authenticate Biometric Success': props<{ user: AuthUser; token: string }>(),
    'Authenticate Biometric Failure': props<{ error: string }>(),

    // Single Sign-On (SSO)
    'SSO Login': props<{ provider: string; idToken: string }>(),
    'SSO Login Success': props<{ user: AuthUser; token: string; refreshToken: string }>(),
    'SSO Login Failure': props<{ error: string }>(),

    'Get SSO Config': props<{ domain: string }>(),
    'Get SSO Config Success': props<{ config: any }>(),
    'Get SSO Config Failure': props<{ error: string }>(),

    // Risk Assessment
    'Assess Login Risk': props<{ context: any }>(),
    'Assess Login Risk Success': props<{ riskScore: number; requiresMFA: boolean }>(),
    'Assess Login Risk Failure': props<{ error: string }>(),

    // Compliance and Audit
    'Log Audit Event': props<{ event: any }>(),
    'Generate Audit Report': props<{ dateRange: { start: Date; end: Date } }>(),
    'Generate Audit Report Success': props<{ reportUrl: string }>(),
    'Generate Audit Report Failure': props<{ error: string }>(),

    // Account Recovery
    'Initiate Account Recovery': props<{ identifier: string; method: string }>(),
    'Initiate Account Recovery Success': props<{ message: string; recoveryId: string }>(),
    'Initiate Account Recovery Failure': props<{ error: string }>(),

    'Verify Recovery Code': props<{ recoveryId: string; code: string }>(),
    'Verify Recovery Code Success': props<{ token: string }>(),
    'Verify Recovery Code Failure': props<{ error: string }>(),

    'Complete Account Recovery': props<{ token: string; newPassword: string }>(),
    'Complete Account Recovery Success': props<{ message: string }>(),
    'Complete Account Recovery Failure': props<{ error: string }>(),
  }
});