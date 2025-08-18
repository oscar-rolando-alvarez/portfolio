export const environment = {
  production: false,
  
  // API Configuration
  api: {
    baseUrl: 'http://localhost:3000/api/v1',
    timeout: 30000,
    retryAttempts: 3,
    enableMocking: true
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
    enableBetaFeatures: true,
    enableExperimentalUI: true,
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
    supportedImageFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
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
    availableQualities: ['360p', '480p', '720p', '1080p'],
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
      { urls: 'stun:stun1.l.google.com:19302' }
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
    maxChatRooms: 100
  },

  // Assessment Configuration
  assessment: {
    enablePlagiarismDetection: true,
    enableProctoring: true,
    enableLockdownBrowser: false, // Disabled in development
    enableWebcamMonitoring: false, // Disabled in development
    enableScreenRecording: false, // Disabled in development
    enableKeystrokeAnalysis: false, // Disabled in development
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
        publishableKey: 'pk_test_...',
        enableApplePay: true,
        enableGooglePay: true
      },
      paypal: {
        enabled: true,
        clientId: 'your-paypal-client-id',
        environment: 'sandbox'
      }
    },
    supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD'],
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
        enabled: false, // Disabled in development
        trackingId: ''
      },
      mixpanel: {
        enabled: false, // Disabled in development
        token: ''
      },
      segment: {
        enabled: false, // Disabled in development
        writeKey: ''
      }
    },
    enableUserTracking: true,
    enablePerformanceTracking: true,
    enableErrorTracking: true,
    enableHeatmaps: false, // Disabled in development
    enableSessionRecording: false, // Disabled in development
    trackingConsent: true
  },

  // Security Configuration
  security: {
    enableCSP: true,
    enableHSTS: false, // Disabled in development
    enableXSSProtection: true,
    enableClickjacking: true,
    enableMIMESniffing: true,
    enableReferrerPolicy: true,
    sessionSecurity: {
      secure: false, // Disabled in development (requires HTTPS)
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
        enabled: false,
        bucket: '',
        region: 'us-east-1',
        accessKeyId: '',
        secretAccessKey: ''
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
        enabled: true,
        uploadPath: '/uploads',
        maxFileSize: 100 * 1024 * 1024 // 100MB
      }
    },
    enableCDN: false,
    enableImageOptimization: true,
    enableVideoTranscoding: false, // Disabled in development
    enableThumbnailGeneration: true
  },

  // Email Configuration
  email: {
    providers: {
      sendgrid: {
        enabled: false,
        apiKey: ''
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
        enabled: true,
        host: 'localhost',
        port: 1025, // MailHog for development
        secure: false,
        user: '',
        password: ''
      }
    },
    fromAddress: 'noreply@eduplatform.local',
    enableTemplates: true,
    enableTracking: false // Disabled in development
  },

  // Notification Configuration
  notifications: {
    enablePushNotifications: true,
    enableEmailNotifications: true,
    enableSMSNotifications: false, // Disabled in development
    enableInAppNotifications: true,
    providers: {
      firebase: {
        enabled: false,
        vapidKey: '',
        config: {}
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
    supportedLanguages: ['en', 'es', 'fr', 'de', 'pt', 'zh', 'ja', 'ko'],
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
    enableDevTools: true,
    enableMockData: true,
    enableStorybook: true,
    enableHotReload: true,
    enableSourceMaps: true,
    enableLogging: true,
    logLevel: 'debug',
    enableDebugging: true,
    enableTesting: true,
    enableCoverage: true
  },

  // Third-party Integrations
  integrations: {
    googleMaps: {
      enabled: false,
      apiKey: ''
    },
    youtube: {
      enabled: true,
      apiKey: ''
    },
    vimeo: {
      enabled: true,
      clientId: '',
      clientSecret: ''
    },
    zoom: {
      enabled: false,
      apiKey: '',
      apiSecret: ''
    },
    microsoft: {
      enabled: false,
      clientId: '',
      clientSecret: ''
    },
    slack: {
      enabled: false,
      clientId: '',
      clientSecret: ''
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
    enableCOPPA: false,
    enableFERPA: true,
    cookieConsent: true,
    dataRetentionDays: 365,
    enableAuditLogging: true,
    enableDataExport: true,
    enableDataDeletion: true,
    enablePrivacyControls: true
  }
};