import { describe, expect, it } from 'vitest'
import { computeTaskStats, filterTasks, groupByStatus, isDueWithin, isOverdue, moveTask, sortByUrgency } from '#shared/utils/tasks'
import { makeTask } from '../fixtures'

const now = new Date('2026-06-15T12:00:00.000Z')

describe('due date helpers', () => {
  it('flags open tasks past their due date as overdue', () => {
    expect(isOverdue(makeTask({ dueDate: '2026-06-14T00:00:00.000Z' }), now)).toBe(true)
    expect(isOverdue(makeTask({ dueDate: '2026-06-14T00:00:00.000Z', status: 'done' }), now)).toBe(false)
    expect(isOverdue(makeTask({ dueDate: undefined }), now)).toBe(false)
  })

  it('detects tasks due within a window', () => {
    expect(isDueWithin(makeTask({ dueDate: '2026-06-20T00:00:00.000Z' }), 7, now)).toBe(true)
    expect(isDueWithin(makeTask({ dueDate: '2026-06-30T00:00:00.000Z' }), 7, now)).toBe(false)
  })
})

describe('computeTaskStats', () => {
  it('aggregates counts and completion rate', () => {
    const stats = computeTaskStats([
      makeTask({ id: 'a', status: 'done' }),
      makeTask({ id: 'b', status: 'in_progress', dueDate: '2026-06-01T00:00:00.000Z' }),
      makeTask({ id: 'c', status: 'todo' }),
      makeTask({ id: 'd', status: 'done' })
    ], now)
    expect(stats).toEqual({ total: 4, todo: 1, inProgress: 1, inReview: 0, completed: 2, overdue: 1, completionRate: 50 })
  })

  it('returns zero completion for an empty list', () => {
    expect(computeTaskStats([], now).completionRate).toBe(0)
  })
})

describe('filterTasks', () => {
  const tasks = [
    makeTask({ id: 'a', title: 'Design login', tags: ['ux'], assigneeIds: ['u1'], priority: 3 }),
    makeTask({ id: 'b', title: 'API pagination', status: 'done', assigneeIds: ['u2'], projectId: 'p2' })
  ]

  it('searches title and tags case-insensitively', () => {
    expect(filterTasks(tasks, { search: 'UX' }).map(t => t.id)).toEqual(['a'])
    expect(filterTasks(tasks, { search: 'pagination' }).map(t => t.id)).toEqual(['b'])
  })

  it('combines structured filters', () => {
    expect(filterTasks(tasks, { statuses: ['done'] }).map(t => t.id)).toEqual(['b'])
    expect(filterTasks(tasks, { assigneeIds: ['u1'], priorities: [3] }).map(t => t.id)).toEqual(['a'])
    expect(filterTasks(tasks, { projectIds: ['p3'] })).toEqual([])
  })
})

describe('ordering', () => {
  it('groups by status sorted by position', () => {
    const groups = groupByStatus([
      makeTask({ id: 'a', position: 1 }),
      makeTask({ id: 'b', position: 0 }),
      makeTask({ id: 'c', status: 'done' })
    ])
    expect(groups.todo.map(t => t.id)).toEqual(['b', 'a'])
    expect(groups.done.map(t => t.id)).toEqual(['c'])
  })

  it('sorts by priority then due date', () => {
    const sorted = sortByUrgency([
      makeTask({ id: 'low', priority: 1 }),
      makeTask({ id: 'late', priority: 4, dueDate: '2026-07-01T00:00:00.000Z' }),
      makeTask({ id: 'soon', priority: 4, dueDate: '2026-06-16T00:00:00.000Z' })
    ])
    expect(sorted.map(t => t.id)).toEqual(['soon', 'late', 'low'])
  })
})

describe('moveTask', () => {
  const board = [
    makeTask({ id: 'a', status: 'todo', position: 0 }),
    makeTask({ id: 'b', status: 'todo', position: 1 }),
    makeTask({ id: 'c', status: 'in_progress', position: 0 })
  ]

  it('moves a task across columns and renumbers both columns', () => {
    const result = moveTask(board, 'a', 'in_progress', 0)
    const byId = Object.fromEntries(result.map(t => [t.id, t]))
    expect(byId.a).toMatchObject({ status: 'in_progress', position: 0 })
    expect(byId.c).toMatchObject({ status: 'in_progress', position: 1 })
    expect(byId.b).toMatchObject({ status: 'todo', position: 0 })
  })

  it('clamps out-of-range positions and does not mutate input', () => {
    const result = moveTask(board, 'a', 'in_progress', 99)
    expect(result.find(t => t.id === 'a')?.position).toBe(1)
    expect(board[0]).toMatchObject({ status: 'todo', position: 0 })
  })

  it('ignores unknown task ids', () => {
    expect(moveTask(board, 'zzz', 'done', 0)).toEqual(board)
  })
})
