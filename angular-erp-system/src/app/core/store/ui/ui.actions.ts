import { createAction, props } from '@ngrx/store';

export const setLoading = createAction(
  '[UI] Set Loading',
  props<{ isLoading: boolean }>()
);

export const showLoader = createAction('[UI] Show Loader');

export const hideLoader = createAction('[UI] Hide Loader');

export const setSidenavOpen = createAction(
  '[UI] Set Sidenav Open',
  props<{ isOpen: boolean }>()
);

export const toggleSidenav = createAction('[UI] Toggle Sidenav');

export const setMobileView = createAction(
  '[UI] Set Mobile View',
  props<{ isMobile: boolean }>()
);

export const setPageTitle = createAction(
  '[UI] Set Page Title',
  props<{ title: string }>()
);

export const setBreadcrumbs = createAction(
  '[UI] Set Breadcrumbs',
  props<{ breadcrumbs: { label: string; url?: string }[] }>()
);

export const setFullscreenMode = createAction(
  '[UI] Set Fullscreen Mode',
  props<{ isFullscreen: boolean }>()
);