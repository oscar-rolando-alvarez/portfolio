export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (user.role !== 'admin' && user.role !== 'manager') {
    throw createError({ statusCode: 403, statusMessage: 'Only managers can delete tasks' })
  }

  const id = getRouterParam(event, 'id')!
  if (!useRepository().deleteTask(id)) {
    throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  }
  setResponseStatus(event, 204)
  return null
})
