// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxt/eslint', '@nuxt/test-utils/module'],

  devtools: { enabled: true },

  app: {
    head: {
      title: 'Vue Project Management',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'Project management workspace with dashboard, Kanban board and project tracking.' },
        { name: 'theme-color', content: '#6366f1' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'manifest', href: '/manifest.json' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  // Server-only values can be overridden with NUXT_* env vars at runtime
  // (e.g. NUXT_JWT_SECRET, NUXT_SESSION_MAX_AGE).
  runtimeConfig: {
    jwtSecret: '',
    sessionMaxAge: 60 * 60 * 8,
    cookieSecure: true,
    public: {
      appName: 'Vue PM'
    }
  },

  compatibilityDate: '2026-10-01',

  typescript: {
    strict: true
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
