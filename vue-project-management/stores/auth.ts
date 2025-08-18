import { defineStore } from 'pinia'
import type { User, UserRole, Permission } from '~/types'

interface AuthState {
  user: User | null
  token: string | null
  refreshToken: string | null
  isLoading: boolean
  error: string | null
  isAuthenticated: boolean
  permissions: Permission[]
  lastActivity: Date | null
}

interface LoginCredentials {
  email: string
  password: string
  rememberMe?: boolean
}

interface RegisterData {
  name: string
  email: string
  password: string
  confirmPassword: string
  organizationName?: string
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    token: null,
    refreshToken: null,
    isLoading: false,
    error: null,
    isAuthenticated: false,
    permissions: [],
    lastActivity: null
  }),

  getters: {
    userRole: (state): UserRole | null => state.user?.role || null,
    
    userFullName: (state): string => state.user?.name || '',
    
    userAvatar: (state): string => state.user?.avatar || '',
    
    hasPermission: (state) => (permission: Permission): boolean => {
      return state.permissions.includes(permission)
    },
    
    hasAnyPermission: (state) => (permissions: Permission[]): boolean => {
      return permissions.some(permission => state.permissions.includes(permission))
    },
    
    hasAllPermissions: (state) => (permissions: Permission[]): boolean => {
      return permissions.every(permission => state.permissions.includes(permission))
    },
    
    isAdmin: (state): boolean => {
      return state.user?.role === UserRole.ADMIN
    },
    
    isManager: (state): boolean => {
      return state.user?.role === UserRole.MANAGER || state.user?.role === UserRole.ADMIN
    },
    
    canCreateProject: (state): boolean => {
      return state.permissions.includes(Permission.CREATE_PROJECT)
    },
    
    canManageUsers: (state): boolean => {
      return state.permissions.includes(Permission.MANAGE_USERS)
    }
  },

  actions: {
    async login(credentials: LoginCredentials) {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ user: User; token: string; refreshToken: string; permissions: Permission[] }>('/api/auth/login', {
          method: 'POST',
          body: credentials
        })

        // Store tokens
        this.token = data.token
        this.refreshToken = data.refreshToken
        this.user = data.user
        this.permissions = data.permissions
        this.isAuthenticated = true
        this.lastActivity = new Date()

        // Store tokens in cookies for persistence
        const tokenCookie = useCookie('auth-token', {
          secure: true,
          sameSite: 'strict',
          maxAge: credentials.rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 24 // 30 days or 1 day
        })
        
        const refreshCookie = useCookie('refresh-token', {
          secure: true,
          sameSite: 'strict',
          maxAge: 60 * 60 * 24 * 30 // 30 days
        })

        tokenCookie.value = data.token
        refreshCookie.value = data.refreshToken

        // Set default authorization header
        this.setAuthHeader(data.token)

        // Initialize user activity tracking
        this.startActivityTracking()

        return { success: true, user: data.user }
      } catch (error: any) {
        this.error = error.data?.message || 'Login failed'
        return { success: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async register(userData: RegisterData) {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ user: User; token: string; refreshToken: string; permissions: Permission[] }>('/api/auth/register', {
          method: 'POST',
          body: userData
        })

        // Store tokens
        this.token = data.token
        this.refreshToken = data.refreshToken
        this.user = data.user
        this.permissions = data.permissions
        this.isAuthenticated = true
        this.lastActivity = new Date()

        // Store tokens in cookies
        const tokenCookie = useCookie('auth-token', {
          secure: true,
          sameSite: 'strict',
          maxAge: 60 * 60 * 24 // 1 day
        })
        
        const refreshCookie = useCookie('refresh-token', {
          secure: true,
          sameSite: 'strict',
          maxAge: 60 * 60 * 24 * 30 // 30 days
        })

        tokenCookie.value = data.token
        refreshCookie.value = data.refreshToken

        // Set default authorization header
        this.setAuthHeader(data.token)

        // Start activity tracking
        this.startActivityTracking()

        return { success: true, user: data.user }
      } catch (error: any) {
        this.error = error.data?.message || 'Registration failed'
        return { success: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async logout() {
      try {
        // Call logout endpoint if token exists
        if (this.token) {
          await $fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.token}`
            }
          })
        }
      } catch (error) {
        // Ignore logout errors and continue with local cleanup
        console.warn('Logout request failed:', error)
      }

      // Clear local state
      this.user = null
      this.token = null
      this.refreshToken = null
      this.isAuthenticated = false
      this.permissions = []
      this.lastActivity = null
      this.error = null

      // Clear cookies
      const tokenCookie = useCookie('auth-token')
      const refreshCookie = useCookie('refresh-token')
      tokenCookie.value = null
      refreshCookie.value = null

      // Clear authorization header
      this.clearAuthHeader()

      // Stop activity tracking
      this.stopActivityTracking()

      // Redirect to login
      await navigateTo('/auth/login')
    },

    async refreshAccessToken() {
      if (!this.refreshToken) {
        throw new Error('No refresh token available')
      }

      try {
        const { data } = await $fetch<{ token: string; user: User; permissions: Permission[] }>('/api/auth/refresh', {
          method: 'POST',
          body: { refreshToken: this.refreshToken }
        })

        this.token = data.token
        this.user = data.user
        this.permissions = data.permissions
        this.lastActivity = new Date()

        // Update token cookie
        const tokenCookie = useCookie('auth-token')
        tokenCookie.value = data.token

        // Update authorization header
        this.setAuthHeader(data.token)

        return data.token
      } catch (error: any) {
        // If refresh fails, logout user
        await this.logout()
        throw error
      }
    },

    async checkAuth() {
      const tokenCookie = useCookie('auth-token')
      const refreshCookie = useCookie('refresh-token')

      if (!tokenCookie.value) {
        return false
      }

      this.token = tokenCookie.value
      this.refreshToken = refreshCookie.value

      try {
        // Verify token and get user data
        const { data } = await $fetch<{ user: User; permissions: Permission[] }>('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${this.token}`
          }
        })

        this.user = data.user
        this.permissions = data.permissions
        this.isAuthenticated = true
        this.lastActivity = new Date()

        // Set authorization header
        this.setAuthHeader(this.token)

        // Start activity tracking
        this.startActivityTracking()

        return true
      } catch (error: any) {
        // If token is invalid, try to refresh
        if (this.refreshToken) {
          try {
            await this.refreshAccessToken()
            return true
          } catch (refreshError) {
            // If refresh fails, clear tokens
            await this.logout()
            return false
          }
        } else {
          // No refresh token, clear auth
          await this.logout()
          return false
        }
      }
    },

    async updateProfile(profileData: Partial<User>) {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ user: User }>('/api/auth/profile', {
          method: 'PUT',
          body: profileData,
          headers: {
            Authorization: `Bearer ${this.token}`
          }
        })

        this.user = data.user
        return { success: true, user: data.user }
      } catch (error: any) {
        this.error = error.data?.message || 'Profile update failed'
        return { success: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async changePassword(passwordData: { currentPassword: string; newPassword: string }) {
      this.isLoading = true
      this.error = null

      try {
        await $fetch('/api/auth/change-password', {
          method: 'PUT',
          body: passwordData,
          headers: {
            Authorization: `Bearer ${this.token}`
          }
        })

        return { success: true }
      } catch (error: any) {
        this.error = error.data?.message || 'Password change failed'
        return { success: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async forgotPassword(email: string) {
      this.isLoading = true
      this.error = null

      try {
        await $fetch('/api/auth/forgot-password', {
          method: 'POST',
          body: { email }
        })

        return { success: true }
      } catch (error: any) {
        this.error = error.data?.message || 'Password reset request failed'
        return { success: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    async resetPassword(token: string, password: string) {
      this.isLoading = true
      this.error = null

      try {
        await $fetch('/api/auth/reset-password', {
          method: 'POST',
          body: { token, password }
        })

        return { success: true }
      } catch (error: any) {
        this.error = error.data?.message || 'Password reset failed'
        return { success: false, error: this.error }
      } finally {
        this.isLoading = false
      }
    },

    setAuthHeader(token: string) {
      // This will be used by interceptors in API calls
      if (process.client) {
        // Set default authorization header for client-side requests
        const nuxtApp = useNuxtApp()
        nuxtApp.ssrContext = nuxtApp.ssrContext || {}
        nuxtApp.ssrContext.token = token
      }
    },

    clearAuthHeader() {
      if (process.client) {
        const nuxtApp = useNuxtApp()
        if (nuxtApp.ssrContext) {
          delete nuxtApp.ssrContext.token
        }
      }
    },

    startActivityTracking() {
      if (process.client) {
        // Update last activity on user interaction
        const updateActivity = () => {
          this.lastActivity = new Date()
        }

        // Listen for user activity
        document.addEventListener('click', updateActivity)
        document.addEventListener('keypress', updateActivity)
        document.addEventListener('scroll', updateActivity)
        document.addEventListener('mousemove', updateActivity)
      }
    },

    stopActivityTracking() {
      if (process.client) {
        // Remove activity listeners
        const updateActivity = () => {
          this.lastActivity = new Date()
        }

        document.removeEventListener('click', updateActivity)
        document.removeEventListener('keypress', updateActivity)
        document.removeEventListener('scroll', updateActivity)
        document.removeEventListener('mousemove', updateActivity)
      }
    },

    clearError() {
      this.error = null
    }
  }
})