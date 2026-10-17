import type { Task } from '#shared/types'

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Task',
    description: '',
    status: 'todo',
    priority: 2,
    projectId: 'p1',
    assigneeIds: [],
    tags: [],
    position: 0,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}
