/**
 * Development environment. Replaced by environment.prod.ts in production builds
 * (see fileReplacements in angular.json).
 */
export const environment = {
  production: false,
  appName: 'Angular ERP System',
  appVersion: '2.0.0',
  /** Base URL of the ERP REST API. Requests are proxied by nginx in the container image. */
  apiUrl: '/api',
  apiVersion: 'v1',
  /** Serve the API from the in-browser mock backend instead of a real server. */
  enableMocking: true,
  security: {
    /** Fallback access-token lifetime used to schedule a refresh when the API omits expiresIn. */
    tokenExpirationTime: 60 * 60 * 1000,
  },
};
