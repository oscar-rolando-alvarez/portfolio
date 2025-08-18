import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { ThemeState } from './types';

export const useThemeStore = create<ThemeState>()(
  devtools(
    persist(
      immer((set, get) => ({
        theme: 'auto',
        colorScheme: 'blue',
        fontSize: 'medium',
        density: 'comfortable',
        animations: true,
        reducedMotion: false,

        setTheme: (theme) =>
          set((state) => {
            state.theme = theme;
            
            // Apply theme to document
            if (typeof window !== 'undefined') {
              const root = document.documentElement;
              if (theme === 'dark') {
                root.classList.add('dark');
              } else if (theme === 'light') {
                root.classList.remove('dark');
              } else {
                // Auto theme - use system preference
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (prefersDark) {
                  root.classList.add('dark');
                } else {
                  root.classList.remove('dark');
                }
              }
            }
          }),

        setColorScheme: (scheme) =>
          set((state) => {
            state.colorScheme = scheme;
            
            // Apply color scheme to document
            if (typeof window !== 'undefined') {
              const root = document.documentElement;
              root.setAttribute('data-color-scheme', scheme);
            }
          }),

        setFontSize: (size) =>
          set((state) => {
            state.fontSize = size;
            
            // Apply font size to document
            if (typeof window !== 'undefined') {
              const root = document.documentElement;
              const sizeMap = {
                small: '14px',
                medium: '16px',
                large: '18px',
              };
              root.style.fontSize = sizeMap[size];
            }
          }),

        setDensity: (density) =>
          set((state) => {
            state.density = density;
            
            // Apply density to document
            if (typeof window !== 'undefined') {
              const root = document.documentElement;
              root.setAttribute('data-density', density);
            }
          }),

        setAnimations: (enabled) =>
          set((state) => {
            state.animations = enabled;
            
            // Apply animation preference to document
            if (typeof window !== 'undefined') {
              const root = document.documentElement;
              if (!enabled) {
                root.style.setProperty('--animation-duration', '0s');
                root.style.setProperty('--transition-duration', '0s');
              } else {
                root.style.removeProperty('--animation-duration');
                root.style.removeProperty('--transition-duration');
              }
            }
          }),

        setReducedMotion: (enabled) =>
          set((state) => {
            state.reducedMotion = enabled;
            
            // Apply reduced motion preference
            if (typeof window !== 'undefined') {
              const root = document.documentElement;
              if (enabled) {
                root.style.setProperty('--animation-duration', '0.01ms');
                root.style.setProperty('--transition-duration', '0.01ms');
              } else {
                root.style.removeProperty('--animation-duration');
                root.style.removeProperty('--transition-duration');
              }
            }
          }),

        toggleTheme: () =>
          set((state) => {
            const { theme } = get();
            let newTheme: 'light' | 'dark' | 'auto';
            
            if (theme === 'light') {
              newTheme = 'dark';
            } else if (theme === 'dark') {
              newTheme = 'auto';
            } else {
              newTheme = 'light';
            }
            
            get().setTheme(newTheme);
          }),
      })),
      {
        name: 'theme-store',
      }
    ),
    {
      name: 'theme-store',
    }
  )
);

// Initialize theme on store creation
if (typeof window !== 'undefined') {
  const store = useThemeStore.getState();
  
  // Set up system theme change listener
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleThemeChange = () => {
    if (store.theme === 'auto') {
      store.setTheme('auto'); // This will trigger the theme application logic
    }
  };
  
  mediaQuery.addEventListener('change', handleThemeChange);
  
  // Set up reduced motion listener
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handleMotionChange = () => {
    store.setReducedMotion(motionQuery.matches);
  };
  
  motionQuery.addEventListener('change', handleMotionChange);
  
  // Initialize based on current system preferences
  if (motionQuery.matches) {
    store.setReducedMotion(true);
  }
  
  // Apply initial theme
  store.setTheme(store.theme);
  store.setColorScheme(store.colorScheme);
  store.setFontSize(store.fontSize);
  store.setDensity(store.density);
}