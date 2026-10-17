export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const input = await readValidatedBody(event, createPostSchema.parse)

  const verdict = await useModerator().check(input.content)

  const post = await usePrisma().post.create({
    data: {
      content: input.content,
      images: input.images,
      visibility: input.visibility,
      moderation: verdict.flagged ? 'FLAGGED' : 'APPROVED',
      authorId: userId
    },
    include: postInclude(userId)
  })

  if (verdict.flagged) {
    console.info(JSON.stringify({ level: 'info', msg: 'post flagged', postId: post.id, reason: verdict.reason }))
  }

  setResponseStatus(event, 201)
  return toPostDTO(post)
})
