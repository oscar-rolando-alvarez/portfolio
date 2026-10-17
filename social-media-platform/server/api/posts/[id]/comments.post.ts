export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const post = await findPostOr404(getRouterParam(event, 'id')!, userId)
  const { content } = await readValidatedBody(event, createCommentSchema.parse)

  const comment = await usePrisma().comment.create({
    data: { content, postId: post.id, authorId: userId },
    include: { author: { select: userSummarySelect } }
  })
  await notify({ userId: post.authorId, actorId: userId, type: 'COMMENT', postId: post.id })

  setResponseStatus(event, 201)
  return toCommentDTO(comment)
})
