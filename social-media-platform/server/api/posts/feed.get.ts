import type { FeedPage } from '#shared/types'

const CANDIDATE_WINDOW_DAYS = 14
const MAX_CANDIDATES = 300

/**
 * Ranked home feed. Candidates (recent visible posts) are loaded in one query and
 * scored in memory with an engagement x affinity / time-decay formula (see utils/ranking.ts).
 */
export default defineEventHandler(async (event): Promise<FeedPage> => {
  const { userId } = requireAuth(event)
  const { page, limit } = await getValidatedQuery(event, pageQuerySchema.parse)
  const prisma = usePrisma()

  const followingIds = await followingIdsOf(userId)
  const since = new Date(Date.now() - CANDIDATE_WINDOW_DAYS * 24 * 3_600_000)

  const rows = await prisma.post.findMany({
    where: { createdAt: { gte: since }, ...visiblePostsWhere(userId, followingIds) },
    include: postInclude(userId),
    orderBy: { createdAt: 'desc' },
    take: MAX_CANDIDATES
  })

  const { items, nextPage } = rankFeed(
    rows.map(row => ({ ...row, likesCount: row._count.likes, commentsCount: row._count.comments })),
    { now: new Date(), viewerId: userId, followingIds: new Set(followingIds) },
    page,
    limit
  )

  return { posts: items.map(toPostDTO), nextPage }
})
