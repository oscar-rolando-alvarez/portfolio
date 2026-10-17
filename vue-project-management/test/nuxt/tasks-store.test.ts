import { beforeEach, describe, expect, it } from 'vitest'
import { registerEndpoint } from '@nuxt/test-utils/runtime'
import { createPinia, setActivePinia } from 'pinia'
import { useTasksStore } from '~/stores/tasks'
import { makeTask } from '../fixtures'

let patchShouldFail = false

registerEndpoint('/api/tasks', () => [
  makeTask({ id: 'a', status: 'todo', position: 0, assigneeIds: ['u1'] }),
  makeTask({ id: 'b', status: 'todo', position: 1, dueDate: '2000-01-01T00:00:00.000Z' })
])

registerEndpoint('/api/tasks/a', {
  method: 'PATCH',
  handler: () => {
    if (patchShouldFail) throw new Error('boom')
    return { ok: true }
  }
})

describe('tasks store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    patchShouldFail = false
  })

  it('loads tasks and derives stats', async () => {
    const store = useTasksStore()
    await store.fetchTasks()
    expect(store.tasks).toHaveLength(2)
    expect(store.taskStats.total).toBe(2)
    expect(store.overdueTasks.map(t => t.id)).toEqual(['b'])
    expect(store.tasksForAssignee('u1').map(t => t.id)).toEqual(['a'])
  })

  it('applies filters', async () => {
    const store = useTasksStore()
    await store.fetchTasks()
    store.setFilters({ assigneeIds: ['u1'] })
    expect(store.filteredTasks.map(t => t.id)).toEqual(['a'])
    store.clearFilters()
    expect(store.filteredTasks).toHaveLength(2)
  })

  it('moves tasks optimistically', async () => {
    const store = useTasksStore()
    await store.fetchTasks()
    await store.moveTask('a', 'done', 0)
    expect(store.tasks.find(t => t.id === 'a')?.status).toBe('done')
    expect(store.tasks.find(t => t.id === 'b')?.position).toBe(0)
  })

  it('rolls back when the API rejects a move', async () => {
    const store = useTasksStore()
    await store.fetchTasks()
    patchShouldFail = true
    await expect(store.moveTask('a', 'done', 0)).rejects.toBeTruthy()
    expect(store.tasks.find(t => t.id === 'a')?.status).toBe('todo')
  })
})
