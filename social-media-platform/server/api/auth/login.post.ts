import { z } from 'zod'
import { authService } from '../../utils/auth'
import { usePrisma } from '../../utils/prisma'

const loginSchema = z.object({
  identifier: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required')
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { identifier, password } = loginSchema.parse(body)

    const { prisma } = usePrisma()

    // Find user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { username: identifier }
        ]
      }
    })

    if (!user || !user.password) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials'
      })
    }

    // Verify password
    const isValidPassword = await authService.verifyPassword(password, user.password)
    
    if (!isValidPassword) {
      throw createError({
        statusCode: 401,
        statusMessage: 'Invalid credentials'
      })
    }

    // Generate tokens
    const { accessToken, refreshToken } = authService.generateTokenPair(user)

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    })

    // Update last active session
    const clientIP = getClientIP(event) || ''
    const userAgent = getHeader(event, 'user-agent') || ''
    await authService.createSession(user.id, clientIP, userAgent)

    // Set secure httpOnly cookie for refresh token
    setCookie(event, 'refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    })

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user

    return {
      success: true,
      message: 'Login successful',
      data: {
        user: userWithoutPassword,
        accessToken
      }
    }

  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Login error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})