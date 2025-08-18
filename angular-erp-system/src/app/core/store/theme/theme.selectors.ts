import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ThemeState } from './theme.reducer';

export const selectThemeState = createFeatureSelector<ThemeState>('theme');

export const selectCurrentTheme = createSelector(
  selectThemeState,
  (state: ThemeState) => state.currentTheme
);

export const selectIsDarkMode = createSelector(
  selectThemeState,
  (state: ThemeState) => state.isDarkMode
);

export const selectSystemPrefersDark = createSelector(
  selectThemeState,
  (state: ThemeState) => state.systemPrefersDark
);