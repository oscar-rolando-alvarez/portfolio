import { createHash, randomBytes } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'

// Pure token helpers (no Nuxt/H3 imports) so they are unit-testable in isolation.

const ISSUER = 'socialconnect'
const AUDIENCE = 'socialconnect-web'

export interface AccessClaims {
  userId: string
  username: string
}

const key = (secret: string) => new TextEncoder().encode(secret)

export async function signAccessToken(claims: AccessClaims, secret: string, ttlSeconds: number): Promise<string> {
  return new SignJWT({ username: claims.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key(secret))
}

export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), { issuer: ISSUER, audience: AUDIENCE })
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') return null
    return { userId: payload.sub, username: payload.username }
  } catch {
    return null
  }
}

/** Opaque, high-entropy refresh token. Only its SHA-256 hash is persisted. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function extractBearer(header: string | undefined | null): string | null {
  if (!header) return null
  const [scheme, value] = header.split(' ')
  return scheme === 'Bearer' && value ? value : null
}
