import { describe, expect, it } from 'vitest'
import { extractBearer, generateRefreshToken, hashToken, signAccessToken, verifyAccessToken } from '../../server/utils/tokens'
import { createPostSchema, loginSchema, registerSchema } from '#shared/utils/validation'

const SECRET = 'unit-test-secret-at-least-32-chars-long'

describe('access tokens', () => {
  it('round-trips claims', async () => {
    const token = await signAccessToken({ userId: 'u1', username: 'alice' }, SECRET, 60)
    await expect(verifyAccessToken(token, SECRET)).resolves.toEqual({ userId: 'u1', username: 'alice' })
  })

  it('rejects wrong secrets, tampering and expiry', async () => {
    const token = await signAccessToken({ userId: 'u1', username: 'alice' }, SECRET, 60)
    await expect(verifyAccessToken(token, `${SECRET}!`)).resolves.toBeNull()
    await expect(verifyAccessToken(token.slice(0, -2), SECRET)).resolves.toBeNull()
    const expired = await signAccessToken({ userId: 'u1', username: 'alice' }, SECRET, -10)
    await expect(verifyAccessToken(expired, SECRET)).resolves.toBeNull()
  })
})

describe('refresh tokens', () => {
  it('are random, url-safe and stored only as a hash', () => {
    const a = generateRefreshToken()
    const b = generateRefreshToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[\w-]{43}$/)
    expect(hashToken(a)).toMatch(/^[a-f0-9]{64}$/)
    expect(hashToken(a)).toBe(hashToken(a))
  })
})

describe('extractBearer', () => {
  it('parses only well-formed Bearer headers', () => {
    expect(extractBearer('Bearer abc')).toBe('abc')
    expect(extractBearer('Basic abc')).toBeNull()
    expect(extractBearer('Bearer')).toBeNull()
    expect(extractBearer(undefined)).toBeNull()
  })
})

describe('validation schemas', () => {
  it('enforces password strength and username format on registration', () => {
    const base = { email: 'A@Example.com', username: 'new_user', password: 'Str0ngPass' }
    expect(registerSchema.parse(base).email).toBe('a@example.com')
    expect(registerSchema.safeParse({ ...base, password: 'weakpass' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, username: 'no spaces' }).success).toBe(false)
    expect(registerSchema.safeParse({ ...base, username: 'ab' }).success).toBe(false)
  })

  it('requires both login fields', () => {
    expect(loginSchema.safeParse({ identifier: 'alice', password: '' }).success).toBe(false)
    expect(loginSchema.safeParse({ identifier: 'alice', password: 'x' }).success).toBe(true)
  })

  it('validates posts: content length, https images and defaults', () => {
    expect(createPostSchema.parse({ content: 'hi' })).toEqual({ content: 'hi', images: [], visibility: 'PUBLIC' })
    expect(createPostSchema.safeParse({ content: '   ' }).success).toBe(false)
    expect(createPostSchema.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false)
    expect(createPostSchema.safeParse({ content: 'hi', images: ['http://insecure.example/a.png'] }).success).toBe(false)
    expect(createPostSchema.safeParse({ content: 'hi', images: ['https://cdn.example/a.png'] }).success).toBe(true)
  })
})
