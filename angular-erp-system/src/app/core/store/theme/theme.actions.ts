import { createAction, props } from '@ngrx/store';

export const setTheme = createAction(
  '[Theme] Set Theme',
  props<{ theme: 'light' | 'dark' | 'auto' }>()
);

export const toggleTheme = createAction('[Theme] Toggle Theme');

export const setSystemTheme = createAction(
  '[Theme] Set System Theme',
  props<{ isDark: boolean }>()
);

export const loadThemePreference = createAction('[Theme] Load Theme Preference');

export const saveThemePreference = createAction(
  '[Theme] Save Theme Preference',
  props<{ theme: 'light' | 'dark' | 'auto' }>()
);