import type { NotificationDTO } from '#shared/types'

export default defineEventHandler(async (event): Promise<NotificationDTO[]> => {
  const { userId } = requireAuth(event)
  const prisma = usePrisma()

  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
  const actorIds = [...new Set(rows.map(r => r.actorId).filter((id): id is string => Boolean(id)))]
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: userSummarySelect })
  const byId = new Map(actors.map(a => [a.id, a]))

  return rows.map(row => ({
    id: row.id,
    type: row.type,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
    actor: row.actorId ? byId.get(row.actorId) ?? null : null,
    postId: row.postId
  }))
})
