import { defineStore } from 'pinia'
import type { User } from '#shared/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const checked = ref(false)

  const isAuthenticated = computed(() => user.value !== null)
  const canManage = computed(() => user.value?.role === 'admin' || user.value?.role === 'manager')
  const canEdit = computed(() => isAuthenticated.value && user.value?.role !== 'viewer')

  /** Loads the current session once; forwards cookies during SSR. */
  async function fetchUser(force = false) {
    if (checked.value && !force) return user.value
    try {
      const fetcher = useRequestFetch()
      const res = await fetcher<{ user: User }>('/api/auth/me')
      user.value = res.user
    } catch {
      user.value = null
    } finally {
      checked.value = true
    }
    return user.value
  }

  async function login(email: string, password: string) {
    const res = await $fetch<{ user: User }>('/api/auth/login', { method: 'POST', body: { email, password } })
    user.value = res.user
    checked.value = true
    return res.user
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, checked, isAuthenticated, canManage, canEdit, fetchUser, login, logout }
})
