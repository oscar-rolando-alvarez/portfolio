import bcrypt from 'bcryptjs'

// Constant-time-ish failure path: always run bcrypt even for unknown users.
const DUMMY_HASH = '$2b$12$9Lz1AQR6kSOm5c7Be7PGT..NmBHlTDGD2JIhBmHnKbAUiWEG5wDju'

export default defineEventHandler(async (event) => {
  const { identifier, password } = await readValidatedBody(event, loginSchema.parse)

  const user = await usePrisma().user.findFirst({
    where: identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { username: { equals: identifier, mode: 'insensitive' } },
    select: { ...userSummarySelect, email: true, bio: true, password: true }
  })

  const valid = await bcrypt.compare(password, user?.password ?? DUMMY_HASH)
  if (!user || !valid) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  await startSession(event, user)
  const { password: _password, ...publicUser } = user
  return { user: publicUser }
})
