import bcrypt from 'bcryptjs'
import type { Project, ProjectSummary, Task, TaskStatus, User } from '#shared/types'
import { moveTask } from '#shared/utils/tasks'
import { seedProjects, seedTasks, seedUsers } from '../data/seed'

export interface NewTask {
  title: string
  description?: string
  status?: TaskStatus
  priority?: Task['priority']
  projectId: string
  assigneeIds?: string[]
  tags?: string[]
  dueDate?: string
}

export type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>

/**
 * Persistence port. The demo ships an in-memory adapter; a Postgres/Prisma adapter
 * can implement the same interface without touching API handlers.
 */
export interface Repository {
  verifyCredentials(email: string, password: string): Promise<User | null>
  getUser(id: string): User | null
  listUsers(): User[]
  listProjects(): ProjectSummary[]
  getProject(id: string): Project | null
  listTasks(filter?: { projectId?: string, assigneeId?: string }): Task[]
  createTask(input: NewTask, createdBy: string): Task
  updateTask(id: string, patch: TaskPatch): Task | null
  deleteTask(id: string): boolean
}

const clone = <T>(value: T): T => structuredClone(value)

export function createMemoryRepository(): Repository {
  const users = seedUsers.map(({ password, ...user }) => ({ user, hash: bcrypt.hashSync(password, 8) }))
  const projects = clone(seedProjects)
  let tasks = clone(seedTasks)
  let sequence = tasks.length

  const summarize = (project: Project): ProjectSummary => {
    const own = tasks.filter(t => t.projectId === project.id && t.status !== 'cancelled')
    const completedCount = own.filter(t => t.status === 'done').length
    return {
      ...project,
      taskCount: own.length,
      completedCount,
      progress: own.length ? Math.round((completedCount / own.length) * 100) : 0
    }
  }

  return {
    async verifyCredentials(email, password) {
      const entry = users.find(u => u.user.email.toLowerCase() === email.toLowerCase())
      if (!entry) return null
      return (await bcrypt.compare(password, entry.hash)) ? clone(entry.user) : null
    },
    getUser: id => clone(users.find(u => u.user.id === id)?.user ?? null),
    listUsers: () => users.map(u => clone(u.user)),
    listProjects: () => projects.map(summarize),
    getProject: id => clone(projects.find(p => p.id === id) ?? null),
    listTasks(filter = {}) {
      return clone(tasks.filter(t =>
        (!filter.projectId || t.projectId === filter.projectId)
        && (!filter.assigneeId || t.assigneeIds.includes(filter.assigneeId))
      ))
    },
    createTask(input, createdBy) {
      const status = input.status ?? 'todo'
      const now = new Date().toISOString()
      const task: Task = {
        id: `t${++sequence}`,
        title: input.title,
        description: input.description ?? '',
        status,
        priority: input.priority ?? 2,
        projectId: input.projectId,
        assigneeIds: input.assigneeIds ?? [],
        tags: input.tags ?? [],
        dueDate: input.dueDate,
        position: tasks.filter(t => t.status === status).length,
        createdBy,
        createdAt: now,
        updatedAt: now
      }
      tasks.push(task)
      return clone(task)
    },
    updateTask(id, patch) {
      const current = tasks.find(t => t.id === id)
      if (!current) return null
      const { status, position, ...rest } = patch
      if (status !== undefined || position !== undefined) {
        tasks = moveTask(tasks, id, status ?? current.status, position ?? current.position)
      }
      const now = new Date().toISOString()
      tasks = tasks.map(t => (t.id === id ? { ...t, ...rest, updatedAt: now } : t))
      return clone(tasks.find(t => t.id === id)!)
    },
    deleteTask(id) {
      const before = tasks.length
      tasks = tasks.filter(t => t.id !== id)
      return tasks.length < before
    }
  }
}

let instance: Repository | undefined

export function useRepository(): Repository {
  instance ??= createMemoryRepository()
  return instance
}
