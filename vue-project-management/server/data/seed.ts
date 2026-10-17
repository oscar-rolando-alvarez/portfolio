import type { Project, Task, User } from '#shared/types'

/**
 * Demo dataset used by the in-memory repository. Dates are generated relative to
 * "now" so the dashboard always shows realistic overdue / due-soon figures.
 */
const DAY = 24 * 60 * 60 * 1000
const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString()

export interface SeedUser extends User {
  /** Plain demo password; hashed with bcrypt when the repository boots. */
  password: string
}

export const seedUsers: SeedUser[] = [
  { id: 'u1', email: 'admin@example.com', name: 'Ada Admin', role: 'admin', title: 'Engineering Director', password: 'admin123' },
  { id: 'u2', email: 'manager@example.com', name: 'Max Manager', role: 'manager', title: 'Project Manager', password: 'manager123' },
  { id: 'u3', email: 'user@example.com', name: 'Mia Member', role: 'member', title: 'Frontend Engineer', password: 'user123' },
  { id: 'u4', email: 'leo@example.com', name: 'Leo Designer', role: 'member', title: 'Product Designer', password: 'leo12345' }
]

export const seedProjects: Project[] = [
  { id: 'p1', name: 'Customer Portal Redesign', description: 'New self-service portal with SSO and usage analytics.', color: '#6366f1', status: 'active', ownerId: 'u2', memberIds: ['u1', 'u2', 'u3', 'u4'], startDate: at(-30), endDate: at(45), createdAt: at(-35) },
  { id: 'p2', name: 'Mobile App v3', description: 'Offline-first rewrite of the field technician app.', color: '#10b981', status: 'active', ownerId: 'u1', memberIds: ['u1', 'u3'], startDate: at(-14), endDate: at(90), createdAt: at(-20) },
  { id: 'p3', name: 'Data Platform Migration', description: 'Move nightly batch jobs to streaming pipelines.', color: '#f59e0b', status: 'planning', ownerId: 'u2', memberIds: ['u2', 'u4'], startDate: at(7), createdAt: at(-3) }
]

type SeedTask = Omit<Task, 'createdAt' | 'updatedAt' | 'createdBy'>

const tasks: SeedTask[] = [
  { id: 't1', title: 'Define portal information architecture', description: 'Card sorting with 5 customers.', status: 'done', priority: 3, projectId: 'p1', assigneeIds: ['u4'], tags: ['ux'], dueDate: at(-10), position: 0 },
  { id: 't2', title: 'SSO integration (OIDC)', description: 'Support Entra ID and Okta tenants.', status: 'in_progress', priority: 4, projectId: 'p1', assigneeIds: ['u3'], tags: ['auth', 'backend'], dueDate: at(3), position: 0 },
  { id: 't3', title: 'Usage analytics widgets', description: 'Charts for API calls and seats.', status: 'todo', priority: 2, projectId: 'p1', assigneeIds: ['u3', 'u4'], tags: ['frontend'], dueDate: at(12), position: 0 },
  { id: 't4', title: 'Accessibility audit', description: 'WCAG 2.2 AA checklist.', status: 'todo', priority: 3, projectId: 'p1', assigneeIds: ['u4'], tags: ['a11y'], dueDate: at(-2), position: 1 },
  { id: 't5', title: 'Billing page review', description: 'Review copy with finance.', status: 'in_review', priority: 2, projectId: 'p1', assigneeIds: ['u2'], tags: ['frontend'], dueDate: at(1), position: 0 },
  { id: 't6', title: 'Offline sync engine spike', description: 'Evaluate CRDT vs. last-write-wins.', status: 'in_progress', priority: 3, projectId: 'p2', assigneeIds: ['u1', 'u3'], tags: ['research'], dueDate: at(5), position: 1 },
  { id: 't7', title: 'Push notification service', description: 'APNs + FCM via a single adapter.', status: 'todo', priority: 2, projectId: 'p2', assigneeIds: ['u3'], tags: ['backend'], dueDate: at(20), position: 2 },
  { id: 't8', title: 'App store assets', description: 'Screenshots and preview video.', status: 'done', priority: 1, projectId: 'p2', assigneeIds: ['u4'], tags: ['design'], dueDate: at(-5), position: 1 },
  { id: 't9', title: 'Inventory current batch jobs', description: 'List owners, SLAs and data volumes.', status: 'todo', priority: 2, projectId: 'p3', assigneeIds: ['u2'], tags: ['data'], dueDate: at(9), position: 3 }
]

export const seedTasks: Task[] = tasks.map(task => ({
  ...task,
  createdBy: 'u2',
  createdAt: at(-20),
  updatedAt: at(-1)
}))
