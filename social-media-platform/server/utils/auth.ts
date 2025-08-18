import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { User } from '@prisma/client'

interface JWTPayload {
  userId: string
  email: string
  username: string
}

interface TokenPair {
  accessToken: string
  refreshToken: string
}

export class AuthService {
  private readonly JWT_SECRET: string
  private readonly JWT_REFRESH_SECRET: string
  private readonly ACCESS_TOKEN_EXPIRY = '15m'
  private readonly REFRESH_TOKEN_EXPIRY = '7d'

  constructor() {
    const config = useRuntimeConfig()
    this.JWT_SECRET = config.jwtSecret
    this.JWT_REFRESH_SECRET = config.jwtSecret + '_refresh'
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 12
    return bcrypt.hash(password, saltRounds)
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  /**
   * Generate JWT access token
   */
  generateAccessToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.JWT_SECRET, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
      issuer: 'socialconnect',
      audience: 'socialconnect-users'
    })
  }

  /**
   * Generate JWT refresh token
   */
  generateRefreshToken(payload: JWTPayload): string {
    return jwt.sign(payload, this.JWT_REFRESH_SECRET, {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
      issuer: 'socialconnect',
      audience: 'socialconnect-users'
    })
  }

  /**
   * Generate both access and refresh tokens
   */
  generateTokenPair(user: User): TokenPair {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      username: user.username
    }

    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload)
    }
  }

  /**
   * Verify JWT access token
   */
  verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, this.JWT_SECRET, {
        issuer: 'socialconnect',
        audience: 'socialconnect-users'
      }) as JWTPayload
    } catch (error) {
      return null
    }
  }

  /**
   * Verify JWT refresh token
   */
  verifyRefreshToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, this.JWT_REFRESH_SECRET, {
        issuer: 'socialconnect',
        audience: 'socialconnect-users'
      }) as JWTPayload
    } catch (error) {
      return null
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) return null
    
    const parts = authHeader.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') return null
    
    return parts[1]
  }

  /**
   * Validate email format
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  /**
   * Validate username format
   */
  isValidUsername(username: string): boolean {
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/
    return usernameRegex.test(username)
  }

  /**
   * Validate password strength
   */
  isValidPassword(password: string): boolean {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/
    return passwordRegex.test(password)
  }

  /**
   * Generate secure random token
   */
  generateSecureToken(): string {
    return crypto.randomUUID()
  }

  /**
   * Create user session
   */
  async createSession(userId: string, ipAddress: string, userAgent: string) {
    const { prisma } = usePrisma()
    const sessionToken = this.generateSecureToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 days

    const session = await prisma.session.create({
      data: {
        userId,
        token: sessionToken,
        ipAddress,
        userAgent,
        expiresAt
      }
    })

    return session
  }

  /**
   * Invalidate user session
   */
  async invalidateSession(sessionToken: string) {
    const { prisma } = usePrisma()
    
    await prisma.session.delete({
      where: { token: sessionToken }
    })
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions() {
    const { prisma } = usePrisma()
    
    await prisma.session.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    })
  }

  /**
   * Get user from token
   */
  async getUserFromToken(token: string) {
    const payload = this.verifyAccessToken(token)
    if (!payload) return null

    const { prisma } = usePrisma()
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
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

    return user
  }
}

export const authService = new AuthService()