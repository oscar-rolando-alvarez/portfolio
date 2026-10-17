export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  if (user.role === 'viewer') {
    throw createError({ statusCode: 403, statusMessage: 'Viewers cannot create tasks' })
  }

  const input = await readValidatedBody(event, createTaskSchema.parse)
  const repo = useRepository()
  if (!repo.getProject(input.projectId)) {
    throw createError({ statusCode: 422, statusMessage: 'Unknown project' })
  }

  setResponseStatus(event, 201)
  return repo.createTask(input, user.id)
})
