import { describe, expect, it } from 'vitest'
import { createMemoryRepository } from '../../server/utils/repository'
import { createTaskSchema, updateTaskSchema } from '../../server/utils/schemas'
import { signSession, verifySession } from '../../server/utils/session'

const SECRET = 'test-secret-with-at-least-32-characters!!'

describe('session tokens', () => {
  it('round-trips a signed session', async () => {
    const token = await signSession({ id: 'u1', role: 'admin' }, SECRET, 60)
    await expect(verifySession(token, SECRET)).resolves.toEqual({ sub: 'u1', role: 'admin' })
  })

  it('rejects tokens signed with another secret or tampered', async () => {
    const token = await signSession({ id: 'u1', role: 'admin' }, SECRET, 60)
    await expect(verifySession(token, `${SECRET}x`)).resolves.toBeNull()
    await expect(verifySession(`${token}x`, SECRET)).resolves.toBeNull()
  })
})

describe('memory repository', () => {
  it('verifies demo credentials with bcrypt', async () => {
    const repo = createMemoryRepository()
    await expect(repo.verifyCredentials('manager@example.com', 'manager123')).resolves.toMatchObject({ id: 'u2' })
    await expect(repo.verifyCredentials('manager@example.com', 'wrong')).resolves.toBeNull()
    await expect(repo.verifyCredentials('nobody@example.com', 'x')).resolves.toBeNull()
  })

  it('never exposes password hashes', () => {
    const repo = createMemoryRepository()
    for (const user of repo.listUsers()) {
      expect(Object.keys(user)).not.toContain('password')
      expect(Object.keys(user)).not.toContain('hash')
    }
  })

  it('creates, moves and deletes tasks', () => {
    const repo = createMemoryRepository()
    const created = repo.createTask({ title: 'Write docs', projectId: 'p1' }, 'u2')
    expect(created).toMatchObject({ status: 'todo', priority: 2, createdBy: 'u2' })

    const moved = repo.updateTask(created.id, { status: 'done', position: 0 })
    expect(moved).toMatchObject({ status: 'done', position: 0 })
    expect(repo.listTasks().filter(t => t.status === 'done').map(t => t.position).sort()).toEqual([0, 1, 2])

    expect(repo.deleteTask(created.id)).toBe(true)
    expect(repo.updateTask(created.id, { title: 'x' })).toBeNull()
  })

  it('derives project progress from tasks', () => {
    const repo = createMemoryRepository()
    const portal = repo.listProjects().find(p => p.id === 'p1')!
    expect(portal.taskCount).toBe(5)
    expect(portal.progress).toBe(20)
  })

  it('returns copies so callers cannot mutate state', () => {
    const repo = createMemoryRepository()
    repo.listTasks()[0]!.title = 'mutated'
    expect(repo.listTasks()[0]!.title).not.toBe('mutated')
  })
})

describe('request schemas', () => {
  it('validates task creation payloads', () => {
    expect(createTaskSchema.safeParse({ title: 'ok', projectId: 'p1' }).success).toBe(false)
    expect(createTaskSchema.safeParse({ title: 'Valid title', projectId: 'p1', priority: 4 }).success).toBe(true)
    expect(createTaskSchema.safeParse({ title: 'Valid title', projectId: 'p1', priority: 9 }).success).toBe(false)
  })

  it('requires at least one field on update', () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false)
    expect(updateTaskSchema.safeParse({ status: 'in_review', position: 0 }).success).toBe(true)
    expect(updateTaskSchema.safeParse({ status: 'archived' }).success).toBe(false)
  })
})
