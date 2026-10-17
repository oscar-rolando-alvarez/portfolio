/** Toggles the viewer's like on a post. */
export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const post = await findPostOr404(getRouterParam(event, 'id')!, userId)
  const prisma = usePrisma()

  const existing = await prisma.like.findUnique({ where: { userId_postId: { userId, postId: post.id } } })
  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } })
  } else {
    await prisma.like.create({ data: { userId, postId: post.id } })
    await notify({ userId: post.authorId, actorId: userId, type: 'LIKE', postId: post.id })
  }

  const likesCount = await prisma.like.count({ where: { postId: post.id } })
  return { liked: !existing, likesCount }
})
