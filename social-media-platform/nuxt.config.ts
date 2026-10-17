// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxt/eslint', '@nuxt/test-utils/module'],

  devtools: { enabled: true },

  app: {
    head: {
      title: 'SocialConnect',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'A modern social network for sharing moments and chatting with friends.' },
        { name: 'theme-color', content: '#3b82f6' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/icon.svg' },
        { rel: 'manifest', href: '/manifest.webmanifest' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],

  // Every key can be overridden at runtime with NUXT_* env vars,
  // e.g. NUXT_JWT_SECRET, NUXT_MODERATION_PROVIDER. The database URL falls back to
  // DATABASE_URL (shared with the Prisma CLI) when NUXT_DATABASE_URL is not set.
  runtimeConfig: {
    databaseUrl: '',
    jwtSecret: '',
    accessTokenTtl: 15 * 60,
    refreshTokenTtl: 30 * 24 * 60 * 60,
    cookieSecure: true,
    moderation: {
      provider: 'keyword',
      baseUrl: '',
      apiKey: '',
      model: ''
    }
  },

  compatibilityDate: '2026-10-01',

  nitro: {
    experimental: {
      websocket: true
    }
  },

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
