import { createReducer, on } from '@ngrx/store';
import * as UiActions from './ui.actions';

export interface UiState {
  isLoading: boolean;
  isSidenavOpen: boolean;
  isMobileView: boolean;
  pageTitle: string;
  breadcrumbs: { label: string; url?: string }[];
  isFullscreen: boolean;
}

export const initialState: UiState = {
  isLoading: false,
  isSidenavOpen: true,
  isMobileView: false,
  pageTitle: 'Dashboard',
  breadcrumbs: [],
  isFullscreen: false
};

export const uiReducer = createReducer(
  initialState,

  on(UiActions.setLoading, (state, { isLoading }) => ({
    ...state,
    isLoading
  })),

  on(UiActions.showLoader, (state) => ({
    ...state,
    isLoading: true
  })),

  on(UiActions.hideLoader, (state) => ({
    ...state,
    isLoading: false
  })),

  on(UiActions.setSidenavOpen, (state, { isOpen }) => ({
    ...state,
    isSidenavOpen: isOpen
  })),

  on(UiActions.toggleSidenav, (state) => ({
    ...state,
    isSidenavOpen: !state.isSidenavOpen
  })),

  on(UiActions.setMobileView, (state, { isMobile }) => ({
    ...state,
    isMobileView: isMobile,
    isSidenavOpen: !isMobile // Auto-close sidenav on mobile
  })),

  on(UiActions.setPageTitle, (state, { title }) => ({
    ...state,
    pageTitle: title
  })),

  on(UiActions.setBreadcrumbs, (state, { breadcrumbs }) => ({
    ...state,
    breadcrumbs
  })),

  on(UiActions.setFullscreenMode, (state, { isFullscreen }) => ({
    ...state,
    isFullscreen
  }))
);