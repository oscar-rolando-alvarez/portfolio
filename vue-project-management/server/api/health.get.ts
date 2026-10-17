// Liveness/readiness probe used by Docker HEALTHCHECK and orchestrators.
export default defineEventHandler(() => ({
  status: 'ok',
  uptime: Math.round(process.uptime()),
  timestamp: new Date().toISOString()
}))
