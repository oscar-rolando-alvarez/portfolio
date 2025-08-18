import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { User, UserPreferences } from '@/types';
import { UserState } from './types';

const defaultPreferences: UserPreferences = {
  theme: 'auto',
  timezone: 'UTC',
  dateFormat: 'MM/dd/yyyy',
  numberFormat: 'en-US',
  defaultDashboard: undefined,
  notifications: {
    email: true,
    push: true,
    inApp: true,
  },
};

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      immer((set, get) => ({
        user: null,
        isAuthenticated: false,
        preferences: defaultPreferences,
        isLoading: false,
        error: null,

        setUser: (user) =>
          set((state) => {
            state.user = user;
            state.isAuthenticated = !!user;
            if (user?.preferences) {
              state.preferences = { ...defaultPreferences, ...user.preferences };
            }
            state.error = null;
          }),

        updateUser: (updates) =>
          set((state) => {
            if (state.user) {
              Object.assign(state.user, updates);
            }
          }),

        setPreferences: (preferences) =>
          set((state) => {
            state.preferences = { ...state.preferences, ...preferences };
            if (state.user) {
              state.user.preferences = state.preferences;
            }
          }),

        login: async (email, password) => {
          set((state) => {
            state.isLoading = true;
            state.error = null;
          });

          try {
            // Mock login API call
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
              throw new Error('Login failed');
            }

            const { user } = await response.json();
            
            set((state) => {
              state.user = user;
              state.isAuthenticated = true;
              state.preferences = { ...defaultPreferences, ...user.preferences };
              state.isLoading = false;
              state.error = null;
            });
          } catch (error) {
            set((state) => {
              state.isLoading = false;
              state.error = error instanceof Error ? error.message : 'Login failed';
            });
            throw error;
          }
        },

        logout: () =>
          set((state) => {
            state.user = null;
            state.isAuthenticated = false;
            state.preferences = defaultPreferences;
            state.error = null;
            
            // Clear any stored tokens
            if (typeof window !== 'undefined') {
              localStorage.removeItem('auth-token');
              sessionStorage.removeItem('auth-token');
            }
          }),

        refreshUser: async () => {
          set((state) => {
            state.isLoading = true;
          });

          try {
            // Mock refresh API call
            const response = await fetch('/api/auth/me', {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('auth-token')}`,
              },
            });

            if (!response.ok) {
              throw new Error('Failed to refresh user');
            }

            const { user } = await response.json();
            
            set((state) => {
              state.user = user;
              state.isAuthenticated = true;
              state.preferences = { ...defaultPreferences, ...user.preferences };
              state.isLoading = false;
              state.error = null;
            });
          } catch (error) {
            set((state) => {
              state.user = null;
              state.isAuthenticated = false;
              state.preferences = defaultPreferences;
              state.isLoading = false;
              state.error = error instanceof Error ? error.message : 'Failed to refresh user';
            });
            throw error;
          }
        },

        setLoading: (loading) =>
          set((state) => {
            state.isLoading = loading;
          }),

        setError: (error) =>
          set((state) => {
            state.error = error;
          }),
      })),
      {
        name: 'user-store',
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
          preferences: state.preferences,
        }),
      }
    ),
    {
      name: 'user-store',
    }
  )
);