export const environment = {
  production: true,
  
  // API Configuration
  api: {
    baseUrl: 'https://api.eduplatform.com/v1',
    timeout: 30000,
    retryAttempts: 3,
    enableMocking: false
  },

  // Authentication
  auth: {
    tokenStorageKey: 'eduplatform_token',
    refreshTokenKey: 'eduplatform_refresh_token',
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    refreshThreshold: 5 * 60 * 1000, // 5 minutes before expiry
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutes
    enableBiometric: true,
    enableSocialLogin: true
  },

  // Feature Flags
  features: {
    enableBetaFeatures: false,
    enableExperimentalUI: false,
    enableAdvancedAnalytics: true,
    enableAIAssistance: true,
    enableVirtualClassrooms: true,
    enableMobileApp: true,
    enableOfflineMode: true,
    enableMultiLanguage: true,
    enableAccessibilityMode: true,
    enableDarkMode: true,
    enableRealTimeChat: true,
    enableVideoStreaming: true,
    enableWebRTC: true,
    enablePushNotifications: true,
    enableServiceWorker: true
  },

  // UI Configuration
  ui: {
    itemsPerPage: 20,
    maxFileUploadSize: 100 * 1024 * 1024, // 100MB
    supportedVideoFormats: ['mp4', 'webm', 'ogg', 'mov'],
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    supportedDocumentFormats: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt'],
    supportedAudioFormats: ['mp3', 'wav', 'ogg', 'aac'],
    theme: {
      defaultTheme: 'light',
      enableSystemTheme: true,
      customThemes: ['purple', 'blue', 'green', 'orange']
    },
    animations: {
      enableAnimations: true,
      animationDuration: 300,
      respectReducedMotion: true
    }
  },

  // Video Streaming
  video: {
    enableAdaptiveStreaming: true,
    enableHLS: true,
    enableDASH: true,
    defaultQuality: '720p',
    availableQualities: ['360p', '480p', '720p', '1080p', '4K'],
    enableSubtitles: true,
    enableChapters: true,
    enablePlaybackSpeed: true,
    enablePictureInPicture: true,
    enableFullscreen: true,
    autoplay: false,
    preload: 'metadata',
    bufferSize: 30, // seconds
    seekThreshold: 5 // seconds
  },

  // WebRTC Configuration
  webrtc: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { 
        urls: 'turn:your-turn-server.com:3478',
        username: 'your-username',
        credential: 'your-credential'
      }
    ],
    enableAudio: true,
    enableVideo: true,
    enableScreenShare: true,
    enableDataChannel: true,
    videoConstraints: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 }
    },
    audioConstraints: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  },

  // Chat and Communication
  chat: {
    enableRealTimeChat: true,
    maxMessageLength: 2000,
    enableFileSharing: true,
    enableEmojis: true,
    enableMarkdown: true,
    enableMentions: true,
    enableTypingIndicators: true,
    enableReadReceipts: true,
    messageRetentionDays: 365,
    maxChatRooms: 1000
  },

  // Assessment Configuration
  assessment: {
    enablePlagiarismDetection: true,
    enableProctoring: true,
    enableLockdownBrowser: true,
    enableWebcamMonitoring: true,
    enableScreenRecording: true,
    enableKeystrokeAnalysis: true,
    enableTimeTracking: true,
    enableAutoSave: true,
    autoSaveInterval: 30, // seconds
    maxAttempts: 3,
    enableHints: true,
    enableFeedback: true,
    randomizeQuestions: true,
    randomizeAnswers: true
  },

  // Payment Configuration
  payment: {
    enablePayments: true,
    providers: {
      stripe: {
        enabled: true,
        publishableKey: 'pk_live_...',
        enableApplePay: true,
        enableGooglePay: true
      },
      paypal: {
        enabled: true,
        clientId: 'your-paypal-client-id',
        environment: 'live'
      }
    },
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK'],
    defaultCurrency: 'USD',
    enableRefunds: true,
    enableSubscriptions: true,
    enableDiscounts: true,
    enableTaxCalculation: true
  },

  // Analytics Configuration
  analytics: {
    enableAnalytics: true,
    providers: {
      googleAnalytics: {
        enabled: true,
        trackingId: 'G-XXXXXXXXXX'
      },
      mixpanel: {
        enabled: true,
        token: 'your-mixpanel-token'
      },
      segment: {
        enabled: true,
        writeKey: 'your-segment-write-key'
      }
    },
    enableUserTracking: true,
    enablePerformanceTracking: true,
    enableErrorTracking: true,
    enableHeatmaps: true,
    enableSessionRecording: true,
    trackingConsent: true
  },

  // Security Configuration
  security: {
    enableCSP: true,
    enableHSTS: true,
    enableXSSProtection: true,
    enableClickjacking: true,
    enableMIMESniffing: true,
    enableReferrerPolicy: true,
    sessionSecurity: {
      secure: true,
      sameSite: 'strict',
      httpOnly: true
    },
    encryption: {
      algorithm: 'AES-256-GCM',
      keyDerivation: 'PBKDF2'
    }
  },

  // Storage Configuration
  storage: {
    providers: {
      aws: {
        enabled: true,
        bucket: 'eduplatform-assets',
        region: 'us-east-1',
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || ''
      },
      gcp: {
        enabled: false,
        bucket: '',
        projectId: '',
        keyFilename: ''
      },
      azure: {
        enabled: false,
        accountName: '',
        accountKey: '',
        containerName: ''
      },
      local: {
        enabled: false,
        uploadPath: '/uploads',
        maxFileSize: 100 * 1024 * 1024 // 100MB
      }
    },
    enableCDN: true,
    enableImageOptimization: true,
    enableVideoTranscoding: true,
    enableThumbnailGeneration: true
  },

  // Email Configuration
  email: {
    providers: {
      sendgrid: {
        enabled: true,
        apiKey: process.env['SENDGRID_API_KEY'] || ''
      },
      mailgun: {
        enabled: false,
        apiKey: '',
        domain: ''
      },
      ses: {
        enabled: false,
        accessKeyId: '',
        secretAccessKey: '',
        region: 'us-east-1'
      },
      smtp: {
        enabled: false,
        host: '',
        port: 587,
        secure: true,
        user: '',
        password: ''
      }
    },
    fromAddress: 'noreply@eduplatform.com',
    enableTemplates: true,
    enableTracking: true
  },

  // Notification Configuration
  notifications: {
    enablePushNotifications: true,
    enableEmailNotifications: true,
    enableSMSNotifications: true,
    enableInAppNotifications: true,
    providers: {
      firebase: {
        enabled: true,
        vapidKey: process.env['FIREBASE_VAPID_KEY'] || '',
        config: {
          apiKey: process.env['FIREBASE_API_KEY'] || '',
          authDomain: 'eduplatform.firebaseapp.com',
          projectId: 'eduplatform',
          storageBucket: 'eduplatform.appspot.com',
          messagingSenderId: process.env['FIREBASE_MESSAGING_SENDER_ID'] || '',
          appId: process.env['FIREBASE_APP_ID'] || ''
        }
      },
      onesignal: {
        enabled: false,
        appId: ''
      }
    },
    defaultSettings: {
      courseUpdates: true,
      assignmentReminders: true,
      gradeNotifications: true,
      messageNotifications: true,
      systemAnnouncements: true,
      marketing: false
    }
  },

  // Internationalization
  i18n: {
    defaultLanguage: 'en',
    supportedLanguages: ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
    enableRTL: true,
    enablePluralRules: true,
    enableDateLocalization: true,
    enableNumberLocalization: true,
    fallbackLanguage: 'en'
  },

  // Accessibility
  accessibility: {
    enableWCAGCompliance: true,
    enableScreenReader: true,
    enableKeyboardNavigation: true,
    enableHighContrast: true,
    enableLargeText: true,
    enableReducedMotion: true,
    enableColorBlindSupport: true,
    enableFocusManagement: true,
    enableAriaLabels: true,
    enableSkipLinks: true
  },

  // Performance
  performance: {
    enableLazyLoading: true,
    enableImageLazyLoading: true,
    enablePreloading: true,
    enableCompression: true,
    enableCaching: true,
    cacheStrategy: 'stale-while-revalidate',
    enableServiceWorker: true,
    enableWebWorkers: true,
    enableVirtualScrolling: true,
    enablePagination: true,
    maxConcurrentRequests: 6
  },

  // Development Tools
  development: {
    enableDevTools: false,
    enableMockData: false,
    enableStorybook: false,
    enableHotReload: false,
    enableSourceMaps: false,
    enableLogging: false,
    logLevel: 'error',
    enableDebugging: false,
    enableTesting: false,
    enableCoverage: false
  },

  // Third-party Integrations
  integrations: {
    googleMaps: {
      enabled: true,
      apiKey: process.env['GOOGLE_MAPS_API_KEY'] || ''
    },
    youtube: {
      enabled: true,
      apiKey: process.env['YOUTUBE_API_KEY'] || ''
    },
    vimeo: {
      enabled: true,
      clientId: process.env['VIMEO_CLIENT_ID'] || '',
      clientSecret: process.env['VIMEO_CLIENT_SECRET'] || ''
    },
    zoom: {
      enabled: true,
      apiKey: process.env['ZOOM_API_KEY'] || '',
      apiSecret: process.env['ZOOM_API_SECRET'] || ''
    },
    microsoft: {
      enabled: true,
      clientId: process.env['MICROSOFT_CLIENT_ID'] || '',
      clientSecret: process.env['MICROSOFT_CLIENT_SECRET'] || ''
    },
    slack: {
      enabled: true,
      clientId: process.env['SLACK_CLIENT_ID'] || '',
      clientSecret: process.env['SLACK_CLIENT_SECRET'] || ''
    },
    discord: {
      enabled: false,
      clientId: '',
      clientSecret: ''
    }
  },

  // Compliance and Legal
  compliance: {
    enableGDPR: true,
    enableCCPA: true,
    enableCOPPA: true,
    enableFERPA: true,
    cookieConsent: true,
    dataRetentionDays: 2555, // 7 years
    enableAuditLogging: true,
    enableDataExport: true,
    enableDataDeletion: true,
    enablePrivacyControls: true
  }
};