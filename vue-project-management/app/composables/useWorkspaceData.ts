/**
 * Loads projects, team members and tasks into their Pinia stores.
 * Runs during SSR (state is serialized to the client) and again on each client-side navigation.
 */
export function useWorkspaceData() {
  const projects = useProjectsStore()
  const tasks = useTasksStore()
  return callOnce('workspace-data', () => Promise.all([projects.fetchAll(), tasks.fetchTasks()]), { mode: 'navigation' })
}
