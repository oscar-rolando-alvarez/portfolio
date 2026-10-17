/**
 * Production environment.
 *
 * The public build ships as a self-contained demo, so the in-browser mock backend
 * stays enabled. Point `apiUrl` at a real API and set `enableMocking: false` to
 * run against a live backend.
 */
export const environment = {
  production: true,
  appName: 'Angular ERP System',
  appVersion: '2.0.0',
  apiUrl: '/api',
  apiVersion: 'v1',
  enableMocking: true,
  security: {
    tokenExpirationTime: 60 * 60 * 1000,
  },
};
