import { authService } from '../utils/auth'

export default defineEventHandler(async (event) => {
  // Skip auth middleware for public routes
  const publicRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/health',
    '/api/public'
  ]

  const url = getRequestURL(event)
  const isPublicRoute = publicRoutes.some(route => url.pathname.startsWith(route))
  
  if (isPublicRoute || !url.pathname.startsWith('/api/')) {
    return
  }

  // Extract token from Authorization header
  const authHeader = getHeader(event, 'authorization')
  const token = authService.extractTokenFromHeader(authHeader)

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Access token required'
    })
  }

  // Verify token and get user
  const user = await authService.getUserFromToken(token)
  
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid or expired token'
    })
  }

  // Add user to event context
  event.context.user = user
})