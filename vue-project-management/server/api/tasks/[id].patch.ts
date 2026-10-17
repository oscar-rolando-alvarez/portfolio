export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (user.role === 'viewer') {
    throw createError({ statusCode: 403, statusMessage: 'Viewers cannot edit tasks' })
  }

  const id = getRouterParam(event, 'id')!
  const patch = await readValidatedBody(event, updateTaskSchema.parse)
  const task = useRepository().updateTask(id, patch)
  if (!task) throw createError({ statusCode: 404, statusMessage: 'Task not found' })
  return task
})
