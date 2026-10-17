/** Finds or creates the direct conversation between the viewer and `username`. */
export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const { username } = await readValidatedBody(event, startConversationSchema.parse)
  const prisma = usePrisma()

  const other = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true }
  })
  if (!other) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (other.id === userId) throw createError({ statusCode: 400, statusMessage: 'Cannot message yourself' })

  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId } } },
        { participants: { some: { userId: other.id } } },
        { participants: { every: { userId: { in: [userId, other.id] } } } }
      ]
    },
    select: { id: true }
  })
  if (existing) return { id: existing.id }

  const created = await prisma.conversation.create({
    data: { participants: { create: [{ userId }, { userId: other.id }] } },
    select: { id: true }
  })
  setResponseStatus(event, 201)
  return { id: created.id }
})
