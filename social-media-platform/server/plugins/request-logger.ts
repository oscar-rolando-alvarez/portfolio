// Emits one structured JSON log line per API request (method, path, status, duration).
// JSON lines are picked up as-is by Docker, Loki, CloudWatch, etc.
export default defineNitroPlugin((nitroApp) => {
  if (process.env.NODE_ENV === 'test') return

  nitroApp.hooks.hook('request', (event) => {
    event.context.startedAt = performance.now()
  })

  nitroApp.hooks.hook('afterResponse', (event) => {
    if (!event.path.startsWith('/api/')) return
    const started = event.context.startedAt as number | undefined
    console.info(JSON.stringify({
      level: 'info',
      msg: 'request',
      method: event.method,
      path: event.path,
      status: getResponseStatus(event),
      durationMs: started === undefined ? undefined : Math.round(performance.now() - started),
      time: new Date().toISOString()
    }))
  })
})
