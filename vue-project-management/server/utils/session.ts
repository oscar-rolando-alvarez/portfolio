import type { H3Event } from 'h3'
import { jwtVerify, SignJWT } from 'jose'
import type { User } from '#shared/types'

export const SESSION_COOKIE = 'pm_session'
const ISSUER = 'vue-project-management'
const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret-change-me-0123456789'

export interface SessionClaims {
  sub: string
  role: User['role']
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

export async function signSession(user: Pick<User, 'id' | 'role'>, secret: string, maxAgeSeconds: number): Promise<string> {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey(secret))
}

export async function verifySession(token: string, secret: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(secret), { issuer: ISSUER })
    if (typeof payload.sub !== 'string') return null
    return { sub: payload.sub, role: payload.role as User['role'] }
  } catch {
    return null
  }
}

/** Resolves the signing secret; refuses to run in production without one. */
export function resolveSecret(): string {
  const { jwtSecret } = useRuntimeConfig()
  if (jwtSecret) return jwtSecret
  if (process.env.NODE_ENV !== 'production') {
    return DEV_FALLBACK_SECRET
  }
  throw createError({ statusCode: 500, statusMessage: 'NUXT_JWT_SECRET is not configured' })
}

export async function getSessionUser(event: H3Event): Promise<User | null> {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null
  const claims = await verifySession(token, resolveSecret())
  return claims ? useRepository().getUser(claims.sub) : null
}

export async function requireUser(event: H3Event): Promise<User> {
  const user = await getSessionUser(event)
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  return user
}
