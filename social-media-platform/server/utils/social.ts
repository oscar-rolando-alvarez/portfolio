// Small data-access helpers shared by several API routes.

export async function followingIdsOf(userId: string): Promise<string[]> {
  const rows = await usePrisma().follow.findMany({ where: { followerId: userId }, select: { followingId: true } })
  return rows.map(r => r.followingId)
}

/** Posts the viewer may see: public posts, follower-only posts of people they follow, and their own posts. */
export function visiblePostsWhere(viewerId: string, followingIds: string[]) {
  return {
    OR: [
      { authorId: viewerId },
      { moderation: 'APPROVED' as const, visibility: 'PUBLIC' as const },
      { moderation: 'APPROVED' as const, visibility: 'FOLLOWERS' as const, authorId: { in: followingIds } }
    ]
  }
}

export async function notify(input: { userId: string, actorId: string, type: 'LIKE' | 'COMMENT' | 'FOLLOW' | 'MESSAGE', postId?: string }) {
  if (input.userId === input.actorId) return
  const prisma = usePrisma()
  const created = await prisma.notification.create({
    data: { userId: input.userId, actorId: input.actorId, type: input.type, postId: input.postId }
  })
  const actor = await prisma.user.findUnique({ where: { id: input.actorId }, select: userSummarySelect })
  publishToUsers([input.userId], {
    type: 'notification',
    notification: {
      id: created.id,
      type: created.type,
      read: false,
      createdAt: created.createdAt.toISOString(),
      actor,
      postId: created.postId
    }
  })
}

export async function findPostOr404(postId: string, viewerId: string) {
  const prisma = usePrisma()
  const post = await prisma.post.findFirst({
    where: { id: postId, ...visiblePostsWhere(viewerId, await followingIdsOf(viewerId)) },
    select: { id: true, authorId: true }
  })
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found' })
  return post
}
