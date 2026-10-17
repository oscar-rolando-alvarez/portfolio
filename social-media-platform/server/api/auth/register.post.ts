import bcrypt from 'bcryptjs'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, registerSchema.parse)
  const prisma = usePrisma()

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: { equals: input.username, mode: 'insensitive' } }] },
    select: { email: true }
  })
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: existing.email === input.email ? 'Email already registered' : 'Username already taken'
    })
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      displayName: input.displayName ?? input.username,
      password: await bcrypt.hash(input.password, 12)
    },
    select: { ...userSummarySelect, email: true, bio: true }
  })

  await startSession(event, user)
  setResponseStatus(event, 201)
  return { user }
})
