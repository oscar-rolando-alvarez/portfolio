/** Toggles following the given user. */
export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const username = getRouterParam(event, 'username')!
  const prisma = usePrisma()

  const target = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true }
  })
  if (!target) throw createError({ statusCode: 404, statusMessage: 'User not found' })
  if (target.id === userId) throw createError({ statusCode: 400, statusMessage: 'You cannot follow yourself' })

  const key = { followerId_followingId: { followerId: userId, followingId: target.id } }
  const existing = await prisma.follow.findUnique({ where: key })
  if (existing) {
    await prisma.follow.delete({ where: key })
  } else {
    await prisma.follow.create({ data: { followerId: userId, followingId: target.id } })
    await notify({ userId: target.id, actorId: userId, type: 'FOLLOW' })
  }

  const followersCount = await prisma.follow.count({ where: { followingId: target.id } })
  return { following: !existing, followersCount }
})
