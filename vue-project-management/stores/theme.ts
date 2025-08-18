import { defineStore } from 'pinia'

type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  systemTheme: 'light' | 'dark'
}

export const useThemeStore = defineStore('theme', {
  state: (): ThemeState => ({
    theme: 'system',
    systemTheme: 'light'
  }),

  getters: {
    currentTheme: (state): 'light' | 'dark' => {
      if (state.theme === 'system') {
        return state.systemTheme
      }
      return state.theme
    },

    isDark: (state): boolean => {
      return state.theme === 'dark' || (state.theme === 'system' && state.systemTheme === 'dark')
    }
  },

  actions: {
    setTheme(theme: Theme) {
      this.theme = theme
      this.applyTheme()
      this.saveThemePreference()
    },

    initializeTheme() {
      // Load saved theme preference
      const savedTheme = this.loadThemePreference()
      if (savedTheme) {
        this.theme = savedTheme
      }

      // Detect system theme
      this.detectSystemTheme()

      // Listen for system theme changes
      this.watchSystemTheme()

      // Apply initial theme
      this.applyTheme()
    },

    detectSystemTheme() {
      if (process.client && window.matchMedia) {
        this.systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      }
    },

    watchSystemTheme() {
      if (process.client && window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
        
        const handleChange = (e: MediaQueryListEvent) => {
          this.systemTheme = e.matches ? 'dark' : 'light'
          if (this.theme === 'system') {
            this.applyTheme()
          }
        }

        // Modern browsers
        if (mediaQuery.addEventListener) {
          mediaQuery.addEventListener('change', handleChange)
        } else {
          // Fallback for older browsers
          mediaQuery.addListener(handleChange)
        }
      }
    },

    applyTheme() {
      if (process.client) {
        const htmlElement = document.documentElement
        const effectiveTheme = this.currentTheme

        // Update data-theme attribute
        htmlElement.setAttribute('data-theme', effectiveTheme)

        // Update class for Tailwind dark mode
        if (effectiveTheme === 'dark') {
          htmlElement.classList.add('dark')
        } else {
          htmlElement.classList.remove('dark')
        }

        // Update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]')
        if (metaThemeColor) {
          metaThemeColor.setAttribute(
            'content',
            effectiveTheme === 'dark' ? '#1e293b' : '#ffffff'
          )
        }
      }
    },

    saveThemePreference() {
      if (process.client) {
        localStorage.setItem('theme-preference', this.theme)
      }
    },

    loadThemePreference(): Theme | null {
      if (process.client) {
        const saved = localStorage.getItem('theme-preference')
        if (saved && ['light', 'dark', 'system'].includes(saved)) {
          return saved as Theme
        }
      }
      return null
    },

    toggleTheme() {
      const themes: Theme[] = ['light', 'dark', 'system']
      const currentIndex = themes.indexOf(this.theme)
      const nextIndex = (currentIndex + 1) % themes.length
      this.setTheme(themes[nextIndex])
    }
  }
})