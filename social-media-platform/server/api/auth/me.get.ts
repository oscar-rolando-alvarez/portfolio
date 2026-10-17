import type { CurrentUser } from '#shared/types'

export default defineEventHandler(async (event): Promise<{ user: CurrentUser }> => {
  const { userId } = requireAuth(event)
  const user = await usePrisma().user.findUnique({
    where: { id: userId },
    select: { ...userSummarySelect, email: true, bio: true }
  })
  if (!user) throw createError({ statusCode: 401, statusMessage: 'Account no longer exists' })
  return { user }
})
