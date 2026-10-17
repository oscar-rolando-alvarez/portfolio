import { defineStore } from 'pinia'
import type { User, LoginForm, RegisterForm, ApiResponse } from '~/types'

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
    error: null
  }),

  getters: {
    currentUser: (state) => state.user,
    isLoggedIn: (state) => state.isAuthenticated && !!state.user,
    authToken: (state) => state.accessToken
  },

  actions: {
    setLoading(loading: boolean) {
      this.isLoading = loading
    },

    setError(error: string | null) {
      this.error = error
    },

    setAuth(user: User, accessToken: string) {
      this.user = user
      this.accessToken = accessToken
      this.isAuthenticated = true
      this.error = null
    },

    clearAuth() {
      this.user = null
      this.accessToken = null
      this.isAuthenticated = false
      this.error = null
    },

    async login(credentials: LoginForm) {
      this.setLoading(true)
      this.setError(null)

      try {
        const { data } = await $fetch<ApiResponse<{ user: User; accessToken: string }>>('/api/auth/login', {
          method: 'POST',
          body: credentials
        })

        if (data) {
          this.setAuth(data.user, data.accessToken)
          
          // Set token for future requests
          const token = useCookie('auth-token', {
            maxAge: 60 * 15, // 15 minutes
            secure: true,
            sameSite: 'strict'
          })
          token.value = data.accessToken

          await navigateTo('/')
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Login failed')
        throw error
      } finally {
        this.setLoading(false)
      }
    },

    async register(userData: RegisterForm) {
      this.setLoading(true)
      this.setError(null)

      try {
        const { data } = await $fetch<ApiResponse<{ user: User; accessToken: string }>>('/api/auth/register', {
          method: 'POST',
          body: userData
        })

        if (data) {
          this.setAuth(data.user, data.accessToken)
          
          // Set token for future requests
          const token = useCookie('auth-token', {
            maxAge: 60 * 15, // 15 minutes
            secure: true,
            sameSite: 'strict'
          })
          token.value = data.accessToken

          await navigateTo('/')
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Registration failed')
        throw error
      } finally {
        this.setLoading(false)
      }
    },

    async logout() {
      this.setLoading(true)

      try {
        await $fetch('/api/auth/logout', {
          method: 'POST'
        })
      } catch (error) {
        console.error('Logout error:', error)
      } finally {
        this.clearAuth()
        
        // Clear token cookie
        const token = useCookie('auth-token')
        token.value = null

        await navigateTo('/auth/login')
        this.setLoading(false)
      }
    },

    async refreshToken() {
      try {
        const { data } = await $fetch<ApiResponse<{ user: User; accessToken: string }>>('/api/auth/refresh', {
          method: 'POST'
        })

        if (data) {
          this.setAuth(data.user, data.accessToken)
          
          // Update token cookie
          const token = useCookie('auth-token', {
            maxAge: 60 * 15, // 15 minutes
            secure: true,
            sameSite: 'strict'
          })
          token.value = data.accessToken

          return true
        }
      } catch (error) {
        this.clearAuth()
        return false
      }
    },

    async fetchUser() {
      if (!this.accessToken) return

      try {
        const { data } = await $fetch<ApiResponse<{ user: User }>>('/api/auth/me', {
          headers: {
            Authorization: `Bearer ${this.accessToken}`
          }
        })

        if (data) {
          this.user = data.user
          this.isAuthenticated = true
        }
      } catch (error) {
        console.error('Fetch user error:', error)
        this.clearAuth()
      }
    },

    async updateProfile(updates: Partial<User>) {
      if (!this.user) return

      try {
        const { data } = await $fetch<ApiResponse<{ user: User }>>('/api/users/profile', {
          method: 'PATCH',
          body: updates,
          headers: {
            Authorization: `Bearer ${this.accessToken}`
          }
        })

        if (data) {
          this.user = { ...this.user, ...data.user }
        }
      } catch (error: any) {
        this.setError(error.data?.message || 'Profile update failed')
        throw error
      }
    },

    async changePassword(currentPassword: string, newPassword: string) {
      try {
        await $fetch('/api/auth/change-password', {
          method: 'POST',
          body: { currentPassword, newPassword },
          headers: {
            Authorization: `Bearer ${this.accessToken}`
          }
        })
      } catch (error: any) {
        this.setError(error.data?.message || 'Password change failed')
        throw error
      }
    },

    // Initialize auth state from stored token
    async initializeAuth() {
      const token = useCookie('auth-token')
      
      if (token.value) {
        this.accessToken = token.value
        await this.fetchUser()
      } else {
        // Try to refresh token
        const refreshed = await this.refreshToken()
        if (!refreshed && process.client) {
          // Redirect to login if no valid token
          await navigateTo('/auth/login')
        }
      }
    }
  }
})