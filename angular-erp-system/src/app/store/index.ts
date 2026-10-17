import { ActionReducerMap, MetaReducer } from '@ngrx/store';

import { authReducer, AuthState } from '@core/store/auth/auth.reducer';
import {
  notificationReducer,
  NotificationState,
} from '@core/store/notification/notification.reducer';

/**
 * Global NgRx state: authentication and notifications are shared across the
 * whole app and driven by effects. Purely presentational state (theme, loading
 * indicator, layout) is held in signal-based services instead.
 */
export interface AppState {
  auth: AuthState;
  notification: NotificationState;
}

export const reducers: ActionReducerMap<AppState> = {
  auth: authReducer,
  notification: notificationReducer,
};

export const metaReducers: MetaReducer<AppState>[] = [];
