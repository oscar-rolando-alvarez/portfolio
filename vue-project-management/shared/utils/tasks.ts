import type { Priority, Task, TaskFilters, TaskStats, TaskStatus } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled'
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Urgent'
}

export function isOpen(task: Pick<Task, 'status'>): boolean {
  return task.status !== 'done' && task.status !== 'cancelled'
}

export function isOverdue(task: Pick<Task, 'status' | 'dueDate'>, now = new Date()): boolean {
  return Boolean(task.dueDate) && isOpen(task) && new Date(task.dueDate!).getTime() < now.getTime()
}

export function isDueWithin(task: Pick<Task, 'status' | 'dueDate'>, days: number, now = new Date()): boolean {
  if (!task.dueDate || !isOpen(task)) return false
  const due = new Date(task.dueDate).getTime()
  return due >= now.getTime() && due <= now.getTime() + days * DAY_MS
}

export function computeTaskStats(tasks: readonly Task[], now = new Date()): TaskStats {
  const count = (status: TaskStatus) => tasks.filter(t => t.status === status).length
  const total = tasks.length
  const completed = count('done')
  return {
    total,
    todo: count('todo'),
    inProgress: count('in_progress'),
    inReview: count('in_review'),
    completed,
    overdue: tasks.filter(t => isOverdue(t, now)).length,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
  }
}

export function filterTasks(tasks: readonly Task[], filters: TaskFilters): Task[] {
  const query = filters.search?.trim().toLowerCase()
  return tasks.filter((task) => {
    if (query && !(
      task.title.toLowerCase().includes(query)
      || task.description.toLowerCase().includes(query)
      || task.tags.some(tag => tag.toLowerCase().includes(query))
    )) return false
    if (filters.statuses?.length && !filters.statuses.includes(task.status)) return false
    if (filters.priorities?.length && !filters.priorities.includes(task.priority)) return false
    if (filters.projectIds?.length && !filters.projectIds.includes(task.projectId)) return false
    if (filters.assigneeIds?.length && !task.assigneeIds.some(id => filters.assigneeIds!.includes(id))) return false
    return true
  })
}

export function groupByStatus(tasks: readonly Task[]): Record<TaskStatus, Task[]> {
  const groups: Record<TaskStatus, Task[]> = { todo: [], in_progress: [], in_review: [], done: [], cancelled: [] }
  for (const task of tasks) groups[task.status].push(task)
  for (const list of Object.values(groups)) list.sort((a, b) => a.position - b.position)
  return groups
}

/** Highest priority first, then earliest due date. */
export function sortByUrgency(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority
    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY
    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY
    return aDue - bDue
  })
}

/**
 * Moves a task to `status` at `index` and renumbers positions in the affected columns.
 * Pure: returns a new array, never mutates the input.
 */
export function moveTask(tasks: readonly Task[], taskId: string, status: TaskStatus, index: number): Task[] {
  const moving = tasks.find(t => t.id === taskId)
  if (!moving) return [...tasks]

  const target = tasks
    .filter(t => t.status === status && t.id !== taskId)
    .sort((a, b) => a.position - b.position)
  const clamped = Math.max(0, Math.min(index, target.length))
  target.splice(clamped, 0, { ...moving, status })

  const updated = new Map<string, Task>()
  target.forEach((t, i) => updated.set(t.id, { ...t, status, position: i }))

  if (moving.status !== status) {
    tasks
      .filter(t => t.status === moving.status && t.id !== taskId)
      .sort((a, b) => a.position - b.position)
      .forEach((t, i) => updated.set(t.id, { ...t, position: i }))
  }

  return tasks.map(t => updated.get(t.id) ?? t)
}
