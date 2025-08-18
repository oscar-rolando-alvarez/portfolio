import { createReducer, on } from '@ngrx/store';
import * as ThemeActions from './theme.actions';

export interface ThemeState {
  currentTheme: 'light' | 'dark' | 'auto';
  isDarkMode: boolean;
  systemPrefersDark: boolean;
}

export const initialState: ThemeState = {
  currentTheme: 'auto',
  isDarkMode: false,
  systemPrefersDark: false
};

export const themeReducer = createReducer(
  initialState,

  on(ThemeActions.setTheme, (state, { theme }) => {
    const systemPrefersDark = state.systemPrefersDark;
    const isDarkMode = theme === 'dark' || (theme === 'auto' && systemPrefersDark);
    
    return {
      ...state,
      currentTheme: theme,
      isDarkMode
    };
  }),

  on(ThemeActions.toggleTheme, (state) => {
    const newTheme = state.currentTheme === 'light' ? 'dark' : 'light';
    return {
      ...state,
      currentTheme: newTheme,
      isDarkMode: newTheme === 'dark'
    };
  }),

  on(ThemeActions.setSystemTheme, (state, { isDark }) => {
    const isDarkMode = state.currentTheme === 'auto' ? isDark : state.isDarkMode;
    
    return {
      ...state,
      systemPrefersDark: isDark,
      isDarkMode
    };
  })
);