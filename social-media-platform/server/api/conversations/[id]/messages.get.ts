export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const conversationId = getRouterParam(event, 'id')!
  await requireParticipant(conversationId, userId)
  const prisma = usePrisma()

  const rows = await prisma.message.findMany({
    where: { conversationId },
    include: { sender: { select: userSummarySelect } },
    orderBy: { createdAt: 'desc' },
    take: 100
  })

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() }
  })

  return rows.reverse().map(toMessageDTO)
})
