/** Marks all of the viewer's notifications as read. */
export default defineEventHandler(async (event) => {
  const { userId } = requireAuth(event)
  const { count } = await usePrisma().notification.updateMany({
    where: { userId, read: false },
    data: { read: true }
  })
  return { updated: count }
})
