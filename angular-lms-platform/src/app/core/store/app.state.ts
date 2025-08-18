import { ActionReducerMap, MetaReducer } from '@ngrx/store';
import { routerReducer, RouterReducerState } from '@ngrx/router-store';
import { isDevMode } from '@angular/core';

// Feature states
import { AuthState, authReducer } from './auth/auth.reducer';
import { UserState, userReducer } from './user/user.reducer';
import { CourseState, courseReducer } from './course/course.reducer';
import { AssessmentState, assessmentReducer } from './assessment/assessment.reducer';
import { ChatState, chatReducer } from './chat/chat.reducer';
import { UIState, uiReducer } from './ui/ui.reducer';
import { NotificationState, notificationReducer } from './notification/notification.reducer';
import { ProgressState, progressReducer } from './progress/progress.reducer';
import { PaymentState, paymentReducer } from './payment/payment.reducer';
import { ContentState, contentReducer } from './content/content.reducer';
import { AnalyticsState, analyticsReducer } from './analytics/analytics.reducer';

// Custom router state
export interface RouterStateUrl {
  url: string;
  params: any;
  queryParams: any;
}

// Root application state
export interface AppState {
  router: RouterReducerState<RouterStateUrl>;
  auth: AuthState;
  user: UserState;
  course: CourseState;
  assessment: AssessmentState;
  chat: ChatState;
  ui: UIState;
  notification: NotificationState;
  progress: ProgressState;
  payment: PaymentState;
  content: ContentState;
  analytics: AnalyticsState;
}

// Root reducers
export const appReducers: ActionReducerMap<AppState> = {
  router: routerReducer,
  auth: authReducer,
  user: userReducer,
  course: courseReducer,
  assessment: assessmentReducer,
  chat: chatReducer,
  ui: uiReducer,
  notification: notificationReducer,
  progress: progressReducer,
  payment: paymentReducer,
  content: contentReducer,
  analytics: analyticsReducer,
};

// Logger meta reducer for development
export function logger(reducer: any): any {
  return function(state: any, action: any): any {
    console.log('Action:', action);
    console.log('Previous State:', state);
    const nextState = reducer(state, action);
    console.log('Next State:', nextState);
    return nextState;
  };
}

// Local storage sync meta reducer
export function localStorageSync(reducer: any): any {
  return function(state: any, action: any): any {
    const nextState = reducer(state, action);
    
    // Sync auth state to localStorage
    if (nextState.auth) {
      const authData = {
        isAuthenticated: nextState.auth.isAuthenticated,
        user: nextState.auth.user,
        token: nextState.auth.token,
        refreshToken: nextState.auth.refreshToken
      };
      localStorage.setItem('auth_state', JSON.stringify(authData));
    }
    
    // Sync user preferences to localStorage
    if (nextState.user?.preferences) {
      localStorage.setItem('user_preferences', JSON.stringify(nextState.user.preferences));
    }
    
    // Sync UI theme to localStorage
    if (nextState.ui?.theme) {
      localStorage.setItem('ui_theme', nextState.ui.theme);
    }
    
    return nextState;
  };
}

// Error handling meta reducer
export function errorHandler(reducer: any): any {
  return function(state: any, action: any): any {
    try {
      return reducer(state, action);
    } catch (error) {
      console.error('Reducer error:', error);
      // Return current state on error to prevent app crash
      return state;
    }
  };
}

// Rehydration meta reducer
export function rehydration(reducer: any): any {
  return function(state: any, action: any): any {
    if (action.type === '@ngrx/store/init') {
      try {
        // Rehydrate auth state from localStorage
        const authState = localStorage.getItem('auth_state');
        if (authState) {
          const parsedAuthState = JSON.parse(authState);
          state = {
            ...state,
            auth: {
              ...state?.auth,
              ...parsedAuthState,
              isLoading: false,
              error: null
            }
          };
        }
        
        // Rehydrate user preferences from localStorage
        const userPreferences = localStorage.getItem('user_preferences');
        if (userPreferences) {
          const parsedPreferences = JSON.parse(userPreferences);
          state = {
            ...state,
            user: {
              ...state?.user,
              preferences: parsedPreferences
            }
          };
        }
        
        // Rehydrate UI theme from localStorage
        const uiTheme = localStorage.getItem('ui_theme');
        if (uiTheme) {
          state = {
            ...state,
            ui: {
              ...state?.ui,
              theme: uiTheme
            }
          };
        }
      } catch (error) {
        console.error('Error rehydrating state:', error);
        // Clear corrupted data
        localStorage.removeItem('auth_state');
        localStorage.removeItem('user_preferences');
        localStorage.removeItem('ui_theme');
      }
    }
    
    return reducer(state, action);
  };
}

// Performance monitoring meta reducer
export function performanceMonitor(reducer: any): any {
  return function(state: any, action: any): any {
    const start = performance.now();
    const nextState = reducer(state, action);
    const end = performance.now();
    
    const duration = end - start;
    if (duration > 10) { // Log slow actions (>10ms)
      console.warn(`Slow action detected: ${action.type} took ${duration.toFixed(2)}ms`);
    }
    
    return nextState;
  };
}

// State sanitization meta reducer
export function stateSanitizer(reducer: any): any {
  return function(state: any, action: any): any {
    const nextState = reducer(state, action);
    
    // Remove sensitive data from state for security
    if (nextState.auth && nextState.auth.token && action.type.includes('SUCCESS')) {
      // Don't log full tokens in development
      if (isDevMode()) {
        nextState.auth.token = nextState.auth.token.substring(0, 10) + '...';
      }
    }
    
    return nextState;
  };
}

// Meta reducers
export const metaReducers: MetaReducer<AppState>[] = !isDevMode() ? [
  localStorageSync,
  errorHandler,
  rehydration,
  performanceMonitor
] : [
  logger,
  localStorageSync,
  errorHandler,
  rehydration,
  performanceMonitor,
  stateSanitizer
];

// Selectors for the root state
export const getRouterState = (state: AppState) => state.router;
export const getAuthState = (state: AppState) => state.auth;
export const getUserState = (state: AppState) => state.user;
export const getCourseState = (state: AppState) => state.course;
export const getAssessmentState = (state: AppState) => state.assessment;
export const getChatState = (state: AppState) => state.chat;
export const getUIState = (state: AppState) => state.ui;
export const getNotificationState = (state: AppState) => state.notification;
export const getProgressState = (state: AppState) => state.progress;
export const getPaymentState = (state: AppState) => state.payment;
export const getContentState = (state: AppState) => state.content;
export const getAnalyticsState = (state: AppState) => state.analytics;

// Feature flags
export interface FeatureFlags {
  enableBetaFeatures: boolean;
  enableExperimentalUI: boolean;
  enableAdvancedAnalytics: boolean;
  enableAIAssistance: boolean;
  enableVirtualClassrooms: boolean;
  enableMobileApp: boolean;
  enableOfflineMode: boolean;
  enableMultiLanguage: boolean;
  enableAccessibilityMode: boolean;
  enableDarkMode: boolean;
}

export const defaultFeatureFlags: FeatureFlags = {
  enableBetaFeatures: false,
  enableExperimentalUI: false,
  enableAdvancedAnalytics: true,
  enableAIAssistance: false,
  enableVirtualClassrooms: true,
  enableMobileApp: true,
  enableOfflineMode: true,
  enableMultiLanguage: true,
  enableAccessibilityMode: true,
  enableDarkMode: true
};

// Application configuration
export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
  };
  features: FeatureFlags;
  ui: {
    itemsPerPage: number;
    maxFileSize: number;
    supportedVideoFormats: string[];
    supportedImageFormats: string[];
    supportedDocumentFormats: string[];
  };
  security: {
    sessionTimeout: number;
    maxLoginAttempts: number;
    passwordMinLength: number;
    enableTwoFactor: boolean;
  };
  payment: {
    supportedCurrencies: string[];
    enablePayPal: boolean;
    enableStripe: boolean;
    enableApplePay: boolean;
    enableGooglePay: boolean;
  };
  analytics: {
    enableTracking: boolean;
    trackingId?: string;
    enableHeatmaps: boolean;
    enableUserRecording: boolean;
  };
  social: {
    enableFacebookLogin: boolean;
    enableGoogleLogin: boolean;
    enableLinkedInLogin: boolean;
    enableGitHubLogin: boolean;
  };
}

export const defaultAppConfig: AppConfig = {
  api: {
    baseUrl: '/api/v1',
    timeout: 30000,
    retryAttempts: 3
  },
  features: defaultFeatureFlags,
  ui: {
    itemsPerPage: 20,
    maxFileSize: 100 * 1024 * 1024, // 100MB
    supportedVideoFormats: ['mp4', 'webm', 'ogg'],
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    supportedDocumentFormats: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx']
  },
  security: {
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    maxLoginAttempts: 5,
    passwordMinLength: 8,
    enableTwoFactor: true
  },
  payment: {
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
    enablePayPal: true,
    enableStripe: true,
    enableApplePay: true,
    enableGooglePay: true
  },
  analytics: {
    enableTracking: true,
    enableHeatmaps: false,
    enableUserRecording: false
  },
  social: {
    enableFacebookLogin: true,
    enableGoogleLogin: true,
    enableLinkedInLogin: true,
    enableGitHubLogin: false
  }
};