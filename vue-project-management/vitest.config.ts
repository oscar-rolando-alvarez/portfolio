import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        rootDir: '.',
        domEnvironment: 'happy-dom',
        mock: {
          intersectionObserver: true,
          indexedDb: true
        }
      }
    },
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '.nuxt/',
        '.output/',
        'coverage/',
        '**/*.d.ts',
        '**/*.config.*',
        'tests/**'
      ]
    },
    setupFiles: ['./tests/setup.ts']
  }
})