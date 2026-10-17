import { z } from 'zod'

const bodySchema = z.object({ reason: z.string().trim().min(3).max(500) })

/** Users can report a post once; moderators triage reports out of band. */
export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const post = await findPostOr404(getRouterParam(event, 'id')!, userId)
  const { reason } = await readValidatedBody(event, bodySchema.parse)

  await usePrisma().report.upsert({
    where: { postId_reporterId: { postId: post.id, reporterId: userId } },
    create: { postId: post.id, reporterId: userId, reason },
    update: { reason }
  })
  return { ok: true }
})
