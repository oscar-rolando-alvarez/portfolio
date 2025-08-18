import { z } from 'zod'
import { authService } from '../../utils/auth'
import { usePrisma } from '../../utils/prisma'

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  displayName: z.string().min(1).max(50).optional()
})

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { email, username, password, displayName } = registerSchema.parse(body)

    // Additional validation
    if (!authService.isValidEmail(email)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid email format'
      })
    }

    if (!authService.isValidUsername(username)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Username must be 3-20 characters and contain only letters, numbers, and underscores'
      })
    }

    if (!authService.isValidPassword(password)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Password must be at least 8 characters with uppercase, lowercase, and number'
      })
    }

    const { prisma } = usePrisma()

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username }
        ]
      }
    })

    if (existingUser) {
      throw createError({
        statusCode: 409,
        statusMessage: existingUser.email === email ? 'Email already registered' : 'Username already taken'
      })
    }

    // Hash password
    const hashedPassword = await authService.hashPassword(password)

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        displayName: displayName || username,
        privacySettings: {
          create: {}
        }
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        verified: true,
        private: true,
        createdAt: true
      }
    })

    // Generate tokens
    const { accessToken, refreshToken } = authService.generateTokenPair(user as any)

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    })

    // Create session
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

    return {
      success: true,
      message: 'User registered successfully',
      data: {
        user,
        accessToken
      }
    }

  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('Registration error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error'
    })
  }
})