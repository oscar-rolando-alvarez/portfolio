import { z } from 'zod'

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200)
})

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, bodySchema.parse)

  const user = await useRepository().verifyCredentials(email, password)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }

  const { sessionMaxAge, cookieSecure } = useRuntimeConfig()
  const token = await signSession(user, resolveSecret(), Number(sessionMaxAge))
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !import.meta.dev && String(cookieSecure) !== 'false',
    path: '/',
    maxAge: Number(sessionMaxAge)
  })

  return { user }
})
