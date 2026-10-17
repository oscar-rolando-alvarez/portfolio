export default defineEventHandler(async (event) => {
  await requireUser(event)
  const filter = await getValidatedQuery(event, taskQuerySchema.parse)
  return useRepository().listTasks(filter)
})
