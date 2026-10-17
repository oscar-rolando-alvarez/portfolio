/** Persists a direct message and pushes it to every participant over WebSocket. */
export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const conversationId = getRouterParam(event, 'id')!
  await requireParticipant(conversationId, userId)
  const { content } = await readValidatedBody(event, sendMessageSchema.parse)
  const prisma = usePrisma()

  const [message, participants] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId, senderId: userId, content },
      include: { sender: { select: userSummarySelect } }
    }),
    prisma.conversationParticipant.findMany({ where: { conversationId }, select: { userId: true } }),
    prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
  ])

  const dto = toMessageDTO(message)
  publishToUsers(participants.map(p => p.userId), { type: 'message', message: dto })

  setResponseStatus(event, 201)
  return dto
})
