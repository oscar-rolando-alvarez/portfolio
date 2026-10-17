import type { PostDTO, UserProfile } from '#shared/types'

export default defineEventHandler(async (event): Promise<{ profile: UserProfile, posts: PostDTO[] }> => {
  const { userId } = requireAuth(event)
  const username = getRouterParam(event, 'username')!
  const prisma = usePrisma()

  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: {
      ...userSummarySelect,
      bio: true,
      createdAt: true,
      _count: { select: { followers: true, following: true, posts: true } }
    }
  })
  if (!user) throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const followingIds = await followingIdsOf(userId)
  const posts = await prisma.post.findMany({
    where: { authorId: user.id, ...visiblePostsWhere(userId, followingIds) },
    include: postInclude(userId),
    orderBy: { createdAt: 'desc' },
    take: 30
  })

  const { _count, createdAt, ...summary } = user
  return {
    profile: {
      ...summary,
      createdAt: createdAt.toISOString(),
      followersCount: _count.followers,
      followingCount: _count.following,
      postsCount: _count.posts,
      isFollowing: followingIds.includes(user.id),
      isSelf: user.id === userId
    },
    posts: posts.map(toPostDTO)
  }
})
