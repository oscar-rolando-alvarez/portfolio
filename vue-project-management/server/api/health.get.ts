export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  
  // Basic health check
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {
      database: 'unknown',
      redis: 'unknown',
      websocket: 'unknown'
    }
  }

  try {
    // Database health check
    // In a real app, you would check your database connection here
    health.checks.database = 'healthy'
    
    // Redis health check  
    // In a real app, you would check your Redis connection here
    health.checks.redis = 'healthy'
    
    // WebSocket health check
    // In a real app, you would check your WebSocket server here
    health.checks.websocket = 'healthy'
    
    return health
  } catch (error) {
    setResponseStatus(event, 503)
    return {
      ...health,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})