import type { H3Event } from 'h3'
import type { AccessClaims } from './tokens'

export const ACCESS_COOKIE = 'sc_access'
export const REFRESH_COOKIE = 'sc_refresh'

const DEV_SECRET = 'dev-only-insecure-secret-change-me-0123456789'

declare module 'h3' {
  interface H3EventContext {
    auth?: AccessClaims
  }
}

export function authSecret(): string {
  const { jwtSecret } = useRuntimeConfig()
  if (jwtSecret) return jwtSecret
  if (process.env.NODE_ENV !== 'production') return DEV_SECRET
  throw createError({ statusCode: 500, statusMessage: 'NUXT_JWT_SECRET is not configured' })
}

function cookieOptions(maxAge: number) {
  const { cookieSecure } = useRuntimeConfig()
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: !import.meta.dev && String(cookieSecure) !== 'false',
    path: '/',
    maxAge
  }
}

/** Issues a short-lived access JWT and a long-lived, revocable refresh token. */
export async function startSession(event: H3Event, user: { id: string, username: string }) {
  const { accessTokenTtl, refreshTokenTtl } = useRuntimeConfig()
  const refresh = generateRefreshToken()
  await usePrisma().refreshToken.create({
    data: {
      tokenHash: hashToken(refresh),
      userId: user.id,
      expiresAt: new Date(Date.now() + Number(refreshTokenTtl) * 1000)
    }
  })
  const access = await signAccessToken({ userId: user.id, username: user.username }, authSecret(), Number(accessTokenTtl))
  setCookie(event, ACCESS_COOKIE, access, cookieOptions(Number(accessTokenTtl)))
  setCookie(event, REFRESH_COOKIE, refresh, cookieOptions(Number(refreshTokenTtl)))
}

export async function endSession(event: H3Event) {
  const refresh = getCookie(event, REFRESH_COOKIE)
  if (refresh) {
    await usePrisma().refreshToken.updateMany({
      where: { tokenHash: hashToken(refresh), revokedAt: null },
      data: { revokedAt: new Date() }
    })
  }
  deleteCookie(event, ACCESS_COOKIE, { path: '/' })
  deleteCookie(event, REFRESH_COOKIE, { path: '/' })
}

/**
 * Resolves the caller from the access token (cookie or Bearer header). When the access
 * token has expired but a valid refresh token cookie is present, a new access token is
 * minted and the incoming cookie header is patched so SSR sub-requests see it too.
 */
export async function resolveAuth(event: H3Event): Promise<AccessClaims | null> {
  const secret = authSecret()
  const token = extractBearer(getHeader(event, 'authorization')) ?? getCookie(event, ACCESS_COOKIE)
  if (token) {
    const claims = await verifyAccessToken(token, secret)
    if (claims) return claims
  }

  const refresh = getCookie(event, REFRESH_COOKIE)
  if (!refresh) return null

  const stored = await usePrisma().refreshToken.findUnique({
    where: { tokenHash: hashToken(refresh) },
    include: { user: { select: { id: true, username: true } } }
  })
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) return null

  const claims = { userId: stored.user.id, username: stored.user.username }
  const { accessTokenTtl } = useRuntimeConfig()
  const access = await signAccessToken(claims, secret, Number(accessTokenTtl))
  setCookie(event, ACCESS_COOKIE, access, cookieOptions(Number(accessTokenTtl)))
  const original = event.node.req.headers.cookie ?? ''
  event.node.req.headers.cookie = `${original.replace(/(?:^|;\s*)sc_access=[^;]*/, '')}; ${ACCESS_COOKIE}=${access}`
  return claims
}

export function requireAuth(event: H3Event): AccessClaims {
  if (!event.context.auth) {
    throw createError({ statusCode: 401, statusMessage: 'Authentication required' })
  }
  return event.context.auth
}
