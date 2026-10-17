// Liveness + readiness: reports database reachability and connected WebSocket users.
export default defineEventHandler(async (event) => {
  let database: 'up' | 'down' = 'down'
  try {
    await usePrisma().$queryRaw`SELECT 1`
    database = 'up'
  } catch {
    setResponseStatus(event, 503)
  }
  return {
    status: database === 'up' ? 'ok' : 'degraded',
    database,
    realtimeUsers: connectedUserCount(),
    uptime: Math.round(process.uptime())
  }
})
