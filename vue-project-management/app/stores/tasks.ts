import { defineStore } from 'pinia'
import type { Task, TaskFilters, TaskStatus } from '#shared/types'
import { computeTaskStats, filterTasks, groupByStatus, isDueWithin, isOverdue, moveTask as reorder } from '#shared/utils/tasks'

export type TaskViewMode = 'kanban' | 'list'

export type NewTaskInput = Pick<Task, 'title' | 'projectId'> & Partial<Pick<Task, 'description' | 'status' | 'priority' | 'assigneeIds' | 'tags' | 'dueDate'>>

export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const filters = ref<TaskFilters>({})
  const viewMode = ref<TaskViewMode>('kanban')
  const loading = ref(false)

  const filteredTasks = computed(() => filterTasks(tasks.value, filters.value))
  const tasksByStatus = computed(() => groupByStatus(filteredTasks.value))
  const taskStats = computed(() => computeTaskStats(tasks.value))
  const overdueTasks = computed(() => tasks.value.filter(t => isOverdue(t)))
  const dueSoonTasks = computed(() =>
    tasks.value
      .filter(t => isDueWithin(t, 7))
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
  )

  function tasksForAssignee(userId: string) {
    return tasks.value.filter(t => t.assigneeIds.includes(userId))
  }

  async function fetchTasks() {
    loading.value = true
    try {
      tasks.value = await useRequestFetch()<Task[]>('/api/tasks')
    } finally {
      loading.value = false
    }
  }

  async function createTask(input: NewTaskInput) {
    const task = await $fetch<Task>('/api/tasks', { method: 'POST', body: input })
    tasks.value.push(task)
    return task
  }

  /** Optimistic move with rollback if the API rejects the change. */
  async function moveTask(taskId: string, status: TaskStatus, position: number) {
    const snapshot = tasks.value
    tasks.value = reorder(tasks.value, taskId, status, position)
    try {
      await $fetch(`/api/tasks/${taskId}`, { method: 'PATCH', body: { status, position } })
    } catch (error) {
      tasks.value = snapshot
      throw error
    }
  }

  function setFilters(next: TaskFilters) {
    filters.value = { ...filters.value, ...next }
  }

  function clearFilters() {
    filters.value = {}
  }

  return {
    tasks,
    filters,
    viewMode,
    loading,
    filteredTasks,
    tasksByStatus,
    taskStats,
    overdueTasks,
    dueSoonTasks,
    tasksForAssignee,
    fetchTasks,
    createTask,
    moveTask,
    setFilters,
    clearFilters
  }
})
