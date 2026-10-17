// Feed ranking: pure functions, unit-tested without a database.

export interface RankablePost {
  id: string
  authorId: string
  createdAt: Date
  likesCount: number
  commentsCount: number
}

export interface RankingContext {
  now: Date
  viewerId: string
  followingIds: ReadonlySet<string>
}

/** Weight of a comment relative to a like. */
const COMMENT_WEIGHT = 2
/** Boost for authors the viewer follows (and for the viewer's own posts). */
const FOLLOW_BOOST = 1.5
/** Hacker News style time decay exponent. */
const GRAVITY = 1.6

export function scorePost(post: RankablePost, ctx: RankingContext): number {
  const ageHours = Math.max(0, (ctx.now.getTime() - post.createdAt.getTime()) / 3_600_000)
  const engagement = 1 + post.likesCount + COMMENT_WEIGHT * post.commentsCount
  const affinity = post.authorId === ctx.viewerId || ctx.followingIds.has(post.authorId) ? FOLLOW_BOOST : 1
  return (engagement * affinity) / Math.pow(ageHours + 2, GRAVITY)
}

/** Sorts by score (desc), breaking ties by recency, then returns one page. */
export function rankFeed<T extends RankablePost>(posts: readonly T[], ctx: RankingContext, page: number, limit: number) {
  const ranked = posts
    .map(post => ({ post, score: scorePost(post, ctx) }))
    .sort((a, b) => b.score - a.score || b.post.createdAt.getTime() - a.post.createdAt.getTime())
    .map(entry => entry.post)

  const start = (page - 1) * limit
  const items = ranked.slice(start, start + limit)
  return { items, nextPage: start + limit < ranked.length ? page + 1 : null }
}
