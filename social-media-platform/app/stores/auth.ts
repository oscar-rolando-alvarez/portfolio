import { defineStore } from 'pinia'
import type { CurrentUser } from '#shared/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<CurrentUser | null>(null)
  const checked = ref(false)
  const isAuthenticated = computed(() => user.value !== null)

  /** Loads the session once per app instance; cookies are forwarded during SSR. */
  async function fetchUser(force = false) {
    if (checked.value && !force) return user.value
    try {
      const res = await useRequestFetch()<{ user: CurrentUser }>('/api/auth/me')
      user.value = res.user
    } catch {
      user.value = null
    } finally {
      checked.value = true
    }
    return user.value
  }

  async function login(identifier: string, password: string) {
    const res = await $fetch<{ user: CurrentUser }>('/api/auth/login', { method: 'POST', body: { identifier, password } })
    user.value = res.user
    checked.value = true
  }

  async function register(input: { email: string, username: string, password: string, displayName?: string }) {
    const res = await $fetch<{ user: CurrentUser }>('/api/auth/register', { method: 'POST', body: input })
    user.value = res.user
    checked.value = true
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, checked, isAuthenticated, fetchUser, login, register, logout }
})
