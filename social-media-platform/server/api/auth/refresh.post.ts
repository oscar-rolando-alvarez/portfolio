import { authService } from '../../utils/auth'
import { usePrisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  try {
    // Get refresh token from cookie or body
    let refreshToken = getCookie(event, 'refreshToken')
    
    if (!refreshToken) {
      const body = await readBody(event)
      refreshToken = body.refreshToken
    }

    if (!refreshToken) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Refresh token required'
      })
    }

    const { prisma } = usePrisma()

    // Verify refresh token exists in database
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true }
    })

    if (!storedToken || storedToken.expiresAt < new Date()) {
      // Clean up expired token
      if (storedToken) {
        await prisma.refreshToken.delete({
          where: { id: storedToken.id }
        })
      }

      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid or expired refresh token'
      })
    }

    // Verify JWT signature
    const payload = authService.verifyRefreshToken(refreshToken)
    
    if (!payload || payload.userId !== storedToken.userId) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid refresh token'
      })
    }

    // Generate new token pair
    const { accessToken, refreshToken: newRefreshToken } = authService.generateTokenPair(storedToken.user)

    // Replace old refresh token with new one
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        token: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    })

    // Update cookie with new refresh token
    setCookie(event, 'refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    })

    // Return user data without password
    const { password, ...userWithoutPassword } = storedToken.user

    return {
      success: true,
      message: 'Token refreshed successfully',
      data: {
        user: userWithoutPassword,
        accessToken
      }
    }

  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Token refresh error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})