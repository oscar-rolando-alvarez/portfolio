import type { ConversationDTO } from '#shared/types'

export default defineEventHandler(async (event): Promise<ConversationDTO[]> => {
  const { userId } = requireAuth(event)

  const rows = await usePrisma().conversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: { include: { user: { select: userSummarySelect } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: userSummarySelect } } }
    },
    orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    take: 50
  })

  return rows.map((row) => {
    const me = row.participants.find(p => p.userId === userId)
    const last = row.messages[0]
    return {
      id: row.id,
      participants: row.participants.filter(p => p.userId !== userId).map(p => p.user),
      lastMessage: last ? toMessageDTO(last) : null,
      lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      unread: Boolean(last && last.senderId !== userId && (!me?.lastReadAt || me.lastReadAt < last.createdAt))
    }
  })
})
