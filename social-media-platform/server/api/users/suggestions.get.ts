import type { UserSummary } from '#shared/types'

/** "Who to follow": most-followed accounts the viewer does not follow yet. */
export default defineEventHandler(async (event): Promise<UserSummary[]> => {
  const { userId } = requireAuth(event)
  const followingIds = await followingIdsOf(userId)

  return usePrisma().user.findMany({
    where: { id: { notIn: [...followingIds, userId] } },
    select: userSummarySelect,
    orderBy: { followers: { _count: 'desc' } },
    take: 5
  })
})
