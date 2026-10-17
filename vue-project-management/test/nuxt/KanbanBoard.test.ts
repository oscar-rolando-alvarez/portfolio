import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import KanbanBoard from '~/components/kanban/KanbanBoard.vue'
import { makeTask } from '../fixtures'

const tasks = [
  makeTask({ id: 'a', title: 'Draft spec', status: 'todo', position: 0 }),
  makeTask({ id: 'b', title: 'Build API', status: 'in_progress', position: 0, priority: 4 }),
  makeTask({ id: 'c', title: 'Ship it', status: 'done', position: 0 }),
  makeTask({ id: 'x', title: 'Dropped', status: 'cancelled', position: 0 })
]

describe('KanbanBoard', () => {
  it('renders one column per board status with its cards', async () => {
    const wrapper = await mountSuspended(KanbanBoard, { props: { tasks } })

    const columns = wrapper.findAll('section[data-status]')
    expect(columns.map(c => c.attributes('data-status'))).toEqual(['todo', 'in_progress', 'in_review', 'done'])

    expect(wrapper.find('[data-status="todo"]').text()).toContain('Draft spec')
    expect(wrapper.find('[data-status="in_progress"]').text()).toContain('Urgent')
    expect(wrapper.find('[data-status="in_review"]').text()).toContain('Drop tasks here')
    expect(wrapper.text()).not.toContain('Dropped')
  })

  it('emits a move event when a card is dropped on another column', async () => {
    const wrapper = await mountSuspended(KanbanBoard, { props: { tasks } })

    const dataTransfer = { getData: () => 'a' }
    await wrapper.find('[data-status="done"]').trigger('drop', { dataTransfer })

    expect(wrapper.emitted('move')).toEqual([['a', 'done', 1]])
  })

  it('hides add buttons and dragging for read-only users', async () => {
    const wrapper = await mountSuspended(KanbanBoard, { props: { tasks, canEdit: false } })
    expect(wrapper.find('button[aria-label^="Add task"]').exists()).toBe(false)
    expect(wrapper.find('[data-task-id="a"]').attributes('draggable')).toBe('false')
  })
})
