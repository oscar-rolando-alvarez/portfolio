// Domain types shared by the Nuxt app (app/) and the Nitro API (server/).
// String-literal unions (instead of TS enums) keep the types erasable and JSON friendly.

export const USER_ROLES = ['admin', 'manager', 'member', 'viewer'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Columns rendered on the Kanban board, in order. */
export const BOARD_STATUSES = ['todo', 'in_progress', 'in_review', 'done'] as const satisfies readonly TaskStatus[]

export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

/** 1 = low ... 4 = urgent */
export type Priority = 1 | 2 | 3 | 4

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  title: string
  avatar?: string
}

export interface Project {
  id: string
  name: string
  description: string
  color: string
  status: ProjectStatus
  ownerId: string
  memberIds: string[]
  startDate: string
  endDate?: string
  createdAt: string
}

/** Project enriched with task-derived metrics (returned by GET /api/projects). */
export interface ProjectSummary extends Project {
  taskCount: number
  completedCount: number
  progress: number
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  projectId: string
  assigneeIds: string[]
  tags: string[]
  dueDate?: string
  position: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TaskFilters {
  search?: string
  statuses?: TaskStatus[]
  priorities?: Priority[]
  assigneeIds?: string[]
  projectIds?: string[]
}

export interface TaskStats {
  total: number
  todo: number
  inProgress: number
  inReview: number
  completed: number
  overdue: number
  completionRate: number
}
