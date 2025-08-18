export default defineNuxtConfig({
  devtools: { enabled: true },
  
  // Modules
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    '@vueuse/nuxt',
    '@nuxt/image',
    '@vite-pwa/nuxt',
    '@nuxtjs/google-fonts',
    '@sidebase/nuxt-auth'
  ],

  // CSS
  css: [
    '~/assets/css/main.css'
  ],

  // Tailwind CSS
  tailwindcss: {
    cssPath: '~/assets/css/main.css',
    configPath: 'tailwind.config.js',
    exposeConfig: false,
    viewer: true
  },

  // Google Fonts
  googleFonts: {
    families: {
      Inter: [300, 400, 500, 600, 700],
      'Fira Code': [400, 500]
    }
  },

  // PWA Configuration
  pwa: {
    registerType: 'autoUpdate',
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/api\./,
          handler: 'NetworkFirst',
          options: {
            cacheName: 'api-cache',
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 60 * 24 // 24 hours
            }
          }
        },
        {
          urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/,
          handler: 'CacheFirst',
          options: {
            cacheName: 'images-cache',
            expiration: {
              maxEntries: 500,
              maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
            }
          }
        }
      ]
    },
    manifest: {
      name: 'SocialConnect',
      short_name: 'SocialConnect',
      description: 'A modern social media platform',
      theme_color: '#3b82f6',
      background_color: '#ffffff',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: '/',
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    }
  },

  // Auth Configuration
  auth: {
    baseURL: process.env.AUTH_ORIGIN,
    provider: {
      type: 'authjs'
    }
  },

  // Runtime Config
  runtimeConfig: {
    // Private keys (only available on server-side)
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/socialapp',
    firebaseAdminKey: process.env.FIREBASE_ADMIN_KEY,
    
    // Public keys (exposed to client-side)
    public: {
      apiBase: process.env.API_BASE_URL || '/api',
      firebaseConfig: {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
      },
      vapidKey: process.env.VAPID_KEY
    }
  },

  // Build Configuration
  build: {
    transpile: ['@headlessui/vue']
  },

  // Server-side rendering
  ssr: true,

  // Nitro configuration for API routes
  nitro: {
    experimental: {
      wasm: true
    },
    plugins: ['~/server/plugins/websocket.ts']
  },

  // Image optimization
  image: {
    cloudinary: {
      baseURL: process.env.CLOUDINARY_BASE_URL
    },
    providers: {
      cloudinary: {
        provider: 'cloudinary',
        options: {
          baseURL: process.env.CLOUDINARY_BASE_URL
        }
      }
    }
  },

  // TypeScript configuration
  typescript: {
    strict: true,
    typeCheck: true
  },

  // Experimental features
  experimental: {
    payloadExtraction: false,
    typedPages: true
  },

  // App configuration
  app: {
    head: {
      title: 'SocialConnect',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'A modern social media platform for connecting with friends and sharing moments' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' }
      ]
    }
  }
})