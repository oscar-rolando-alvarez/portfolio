export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  apiVersion: 'v1',
  appName: 'Angular ERP System',
  appVersion: '1.0.0',
  enableDebug: true,
  enableMocking: true,
  enableAnalytics: false,
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
    allowedOrigins: ['http://localhost:4200', 'http://localhost:3000']
  }
};