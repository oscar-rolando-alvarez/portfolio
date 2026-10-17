export async function requireParticipant(conversationId: string, userId: string) {
  const participant = await usePrisma().conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } }
  })
  if (!participant) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })
  return participant
}
