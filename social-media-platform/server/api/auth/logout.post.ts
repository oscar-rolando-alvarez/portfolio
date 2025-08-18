import { usePrisma } from '../../utils/prisma'

export default defineEventHandler(async (event) => {
  try {
    // Get refresh token from cookie
    const refreshToken = getCookie(event, 'refreshToken')

    if (refreshToken) {
      const { prisma } = usePrisma()

      // Remove refresh token from database
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken }
      })
    }

    // Clear refresh token cookie
    deleteCookie(event, 'refreshToken')

    return {
      success: true,
      message: 'Logged out successfully'
    }

  } catch (error) {
    console.error('Logout error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})