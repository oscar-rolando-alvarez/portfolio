export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const post = await findPostOr404(getRouterParam(event, 'id')!, userId)

  const rows = await usePrisma().comment.findMany({
    where: { postId: post.id },
    include: { author: { select: userSummarySelect } },
    orderBy: { createdAt: 'asc' },
    take: 100
  })
  return rows.map(toCommentDTO)
})
