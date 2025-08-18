import { isDevMode } from '@angular/core';
import { ActionReducerMap, MetaReducer } from '@ngrx/store';

import { authReducer, AuthState } from '@core/store/auth/auth.reducer';
import { themeReducer, ThemeState } from '@core/store/theme/theme.reducer';
import { notificationReducer, NotificationState } from '@core/store/notification/notification.reducer';
import { uiReducer, UiState } from '@core/store/ui/ui.reducer';

export interface AppState {
  auth: AuthState;
  theme: ThemeState;
  notification: NotificationState;
  ui: UiState;
}

export const reducers: ActionReducerMap<AppState> = {
  auth: authReducer,
  theme: themeReducer,
  notification: notificationReducer,
  ui: uiReducer
};

export const metaReducers: MetaReducer<AppState>[] = isDevMode() ? [] : [];