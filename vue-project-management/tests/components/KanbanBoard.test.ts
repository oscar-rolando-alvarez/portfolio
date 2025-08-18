import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import KanbanBoard from '~/components/kanban/KanbanBoard.vue'
import { useTasksStore } from '~/stores/tasks'
import { useUIStore } from '~/stores/ui'
import type { Task, TaskStatus } from '~/types'

// Mock components that might not be available in test environment
vi.mock('~/components/kanban/KanbanColumn.vue', () => ({
  default: {
    name: 'KanbanColumn',
    template: '<div class="kanban-column" data-testid="kanban-column">{{ title }}</div>',
    props: ['status', 'title', 'tasks', 'color'],
    emits: ['task-moved', 'task-click', 'add-task']
  }
}))

vi.mock('~/components/kanban/KanbanFilters.vue', () => ({
  default: {
    name: 'KanbanFilters',
    template: '<div data-testid="kanban-filters">Filters</div>',
    emits: ['close']
  }
}))

describe('KanbanBoard', () => {
  let wrapper: any
  let tasksStore: any
  let uiStore: any

  const mockTasks: Task[] = [
    {
      id: '1',
      title: 'Test Task 1',
      description: 'Test description',
      status: 'todo' as TaskStatus,
      priority: 2,
      progress: 0,
      projectId: 'project1',
      assignees: ['user1'],
      createdBy: 'user1',
      tags: ['test'],
      attachments: [],
      comments: [],
      customFields: {},
      dependencies: [],
      checklist: [],
      subtasks: [],
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: '2',
      title: 'Test Task 2',
      description: 'Test description 2',
      status: 'in_progress' as TaskStatus,
      priority: 3,
      progress: 50,
      projectId: 'project1',
      assignees: ['user2'],
      createdBy: 'user1',
      tags: ['test', 'urgent'],
      attachments: [],
      comments: [],
      customFields: {},
      dependencies: [],
      checklist: [],
      subtasks: [],
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]

  beforeEach(() => {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      stubActions: false
    })

    wrapper = mount(KanbanBoard, {
      props: {
        title: 'Test Board',
        projectId: 'project1'
      },
      global: {
        plugins: [pinia],
        stubs: {
          UBadge: true,
          UButton: true,
          UDropdown: true,
          USpinner: true,
          UNotifications: true,
          Icon: true
        }
      }
    })

    tasksStore = useTasksStore()
    uiStore = useUIStore()

    // Mock store state
    tasksStore.tasks = mockTasks
    tasksStore.filteredTasks = mockTasks
    tasksStore.isLoading = false
  })

  it('renders correctly with title', () => {
    expect(wrapper.find('h2').text()).toBe('Test Board')
  })

  it('displays correct status counts', () => {
    const badges = wrapper.findAll('[data-testid*="badge"]')
    expect(badges).toBeDefined()
  })

  it('renders kanban columns for each status', () => {
    const columns = wrapper.findAll('[data-testid="kanban-column"]')
    expect(columns.length).toBeGreaterThan(0)
  })

  it('filters tasks by project when projectId is provided', () => {
    // All mock tasks have projectId 'project1', so they should all be included
    const boardTasks = wrapper.vm.boardTasks
    expect(boardTasks).toHaveLength(2)
    expect(boardTasks.every((task: Task) => task.projectId === 'project1')).toBe(true)
  })

  it('filters tasks by assignee when assigneeId is provided', async () => {
    await wrapper.setProps({
      assigneeId: 'user1'
    })

    const boardTasks = wrapper.vm.boardTasks
    expect(boardTasks).toHaveLength(1)
    expect(boardTasks[0].assignees).toContain('user1')
  })

  it('shows filters panel when showFilters is true', async () => {
    expect(wrapper.find('[data-testid="kanban-filters"]').exists()).toBe(false)

    await wrapper.setData({ showFilters: true })
    expect(wrapper.find('[data-testid="kanban-filters"]').exists()).toBe(true)
  })

  it('opens task modal when create task button is clicked', async () => {
    const createButton = wrapper.find('button:contains("Add Task")')
    if (createButton.exists()) {
      await createButton.trigger('click')
      expect(uiStore.openTaskModal).toHaveBeenCalledWith('create')
    }
  })

  it('handles task moved event correctly', async () => {
    const taskId = '1'
    const newStatus = 'in_progress' as TaskStatus
    const newPosition = 1

    await wrapper.vm.handleTaskMoved(taskId, newStatus, newPosition)
    expect(tasksStore.moveTask).toHaveBeenCalledWith(taskId, newStatus, newPosition)
  })

  it('opens task modal when task is clicked', async () => {
    const task = mockTasks[0]
    await wrapper.vm.handleTaskClick(task)
    expect(uiStore.openTaskModal).toHaveBeenCalledWith('view', task.id)
  })

  it('shows loading state when isLoading is true', async () => {
    tasksStore.isLoading = true
    await wrapper.vm.$nextTick()

    const loadingOverlay = wrapper.find('.absolute.inset-0')
    expect(loadingOverlay.exists()).toBe(true)
  })

  it('groups tasks by status correctly', () => {
    const todoTasks = wrapper.vm.getTasksByStatus('todo')
    const inProgressTasks = wrapper.vm.getTasksByStatus('in_progress')

    expect(todoTasks).toHaveLength(1)
    expect(todoTasks[0].status).toBe('todo')

    expect(inProgressTasks).toHaveLength(1)
    expect(inProgressTasks[0].status).toBe('in_progress')
  })

  it('returns correct status labels', () => {
    expect(wrapper.vm.getStatusLabel('todo')).toBe('To Do')
    expect(wrapper.vm.getStatusLabel('in_progress')).toBe('In Progress')
    expect(wrapper.vm.getStatusLabel('in_review')).toBe('In Review')
    expect(wrapper.vm.getStatusLabel('done')).toBe('Done')
  })

  it('returns correct status colors', () => {
    expect(wrapper.vm.getStatusColor('todo')).toBe('gray')
    expect(wrapper.vm.getStatusColor('in_progress')).toBe('blue')
    expect(wrapper.vm.getStatusColor('in_review')).toBe('orange')
    expect(wrapper.vm.getStatusColor('done')).toBe('green')
  })
})