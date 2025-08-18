import { createFeatureSelector, createSelector } from '@ngrx/store';
import { UiState } from './ui.reducer';

export const selectUiState = createFeatureSelector<UiState>('ui');

export const selectIsLoading = createSelector(
  selectUiState,
  (state: UiState) => state.isLoading
);

export const selectIsSidenavOpen = createSelector(
  selectUiState,
  (state: UiState) => state.isSidenavOpen
);

export const selectIsMobileView = createSelector(
  selectUiState,
  (state: UiState) => state.isMobileView
);

export const selectPageTitle = createSelector(
  selectUiState,
  (state: UiState) => state.pageTitle
);

export const selectBreadcrumbs = createSelector(
  selectUiState,
  (state: UiState) => state.breadcrumbs
);

export const selectIsFullscreen = createSelector(
  selectUiState,
  (state: UiState) => state.isFullscreen
);