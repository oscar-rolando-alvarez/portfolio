export default defineNuxtConfig({
  devtools: { enabled: true },
  
  // Enable TypeScript strict mode
  typescript: {
    strict: true,
    typeCheck: true
  },

  // CSS framework and styling
  css: [
    '~/assets/css/main.scss',
    'vue-toastification/dist/index.css'
  ],

  // Modules
  modules: [
    '@nuxt/ui',
    '@pinia/nuxt',
    '@vueuse/nuxt',
    '@nuxt/devtools'
  ],

  // UI configuration
  ui: {
    global: true,
    icons: ['heroicons', 'lucide']
  },

  // Pinia configuration
  pinia: {
    storesDirs: ['./stores/**']
  },

  // Runtime config
  runtimeConfig: {
    // Private keys (only available on server-side)
    jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
    dbUrl: process.env.DATABASE_URL || 'sqlite://./data/app.db',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    
    // Public keys (exposed to client-side)
    public: {
      apiBase: process.env.API_BASE_URL || '/api',
      wsUrl: process.env.WS_URL || 'ws://localhost:3001',
      maxFileSize: process.env.MAX_FILE_SIZE || '10MB',
      supportedFileTypes: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt']
    }
  },

  // PWA Configuration
  app: {
    head: {
      title: 'Vue Project Management',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Comprehensive project management application built with Vue 3' },
        { name: 'theme-color', content: '#6366f1' }
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'manifest', href: '/manifest.json' }
      ]
    }
  },

  // Build configuration
  build: {
    transpile: ['chart.js']
  },

  // Server-side rendering
  ssr: true,

  // Performance optimizations
  experimental: {
    payloadExtraction: false,
    typedPages: true
  },

  // Vite configuration
  vite: {
    define: {
      global: 'globalThis'
    },
    optimizeDeps: {
      include: ['chart.js', 'date-fns']
    }
  },

  // Nitro configuration for API routes
  nitro: {
    experimental: {
      wasm: true
    }
  },

  // Auto-imports configuration
  imports: {
    dirs: [
      'composables/**',
      'utils/**',
      'types/**'
    ]
  },

  // Component auto-discovery
  components: [
    {
      path: '~/components',
      pathPrefix: false
    }
  ]
})