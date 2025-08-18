export const environment = {
  production: true,
  apiUrl: 'https://api.yourcompany.com/api',
  apiVersion: 'v1',
  appName: 'Angular ERP System',
  appVersion: '1.0.0',
  enableDebug: false,
  enableMocking: false,
  enableAnalytics: true,
  enablePWA: true,
  features: {
    enableRealtimeUpdates: true,
    enableOfflineMode: true,
    enableAdvancedSearch: true,
    enableAuditLog: true,
    enableDataExport: true,
    enableFileUpload: true,
    enableNotifications: true,
    enableThemes: true,
    enableI18n: true
  },
  external: {
    chartsLibrary: 'chart.js',
    mapsProvider: 'google',
    paymentProvider: 'stripe',
    emailProvider: 'sendgrid'
  },
  security: {
    tokenExpirationTime: 3600000, // 1 hour
    refreshTokenExpirationTime: 2592000000, // 30 days
    enableCSRF: true,
    enableCORS: true,
    allowedOrigins: ['https://yourcompany.com', 'https://app.yourcompany.com']
  }
};