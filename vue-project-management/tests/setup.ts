import { config } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { vi } from 'vitest'

// Global test setup
beforeEach(() => {
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))

  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  }
  global.localStorage = localStorageMock

  // Mock fetch
  global.fetch = vi.fn()

  // Mock Notification API
  global.Notification = vi.fn().mockImplementation(() => ({
    close: vi.fn(),
  }))
  global.Notification.permission = 'granted'
  global.Notification.requestPermission = vi.fn().mockResolvedValue('granted')
})

// Configure Vue Test Utils
config.global.plugins = [
  createTestingPinia({
    createSpy: vi.fn,
    stubActions: false,
  })
]

// Mock Nuxt composables
vi.mock('#app', () => ({
  useNuxtApp: () => ({
    $router: {
      push: vi.fn(),
      replace: vi.fn(),
      go: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    },
    $route: {
      path: '/',
      params: {},
      query: {},
      fullPath: '/',
    },
  }),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    go: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  useRoute: () => ({
    path: '/',
    params: {},
    query: {},
    fullPath: '/',
  }),
  navigateTo: vi.fn(),
  useRuntimeConfig: () => ({
    public: {
      apiBase: '/api',
      wsUrl: 'ws://localhost:3001',
      maxFileSize: '10MB',
    },
    jwtSecret: 'test-secret',
  }),
  useHead: vi.fn(),
  useCookie: vi.fn(() => ({
    value: null,
  })),
}))

// Mock $fetch
vi.mock('ofetch', () => ({
  $fetch: vi.fn(),
}))

global.$fetch = vi.fn()

afterEach(() => {
  vi.clearAllMocks()
})