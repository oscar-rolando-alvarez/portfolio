import { defineStore } from 'pinia'
import type { Task, TaskStatus, Priority, Comment, Attachment, TimeEntry } from '~/types'

interface TasksState {
  tasks: Task[]
  currentTask: Task | null
  isLoading: boolean
  error: string | null
  searchQuery: string
  filters: {
    status: TaskStatus[]
    priority: Priority[]
    assignees: string[]
    projects: string[]
    tags: string[]
    dueDate: {
      start?: Date
      end?: Date
    }
  }
  sortBy: 'title' | 'createdAt' | 'updatedAt' | 'priority' | 'dueDate' | 'status'
  sortOrder: 'asc' | 'desc'
  viewMode: 'list' | 'kanban' | 'calendar' | 'gantt'
}

export const useTasksStore = defineStore('tasks', {
  state: (): TasksState => ({
    tasks: [],
    currentTask: null,
    isLoading: false,
    error: null,
    searchQuery: '',
    filters: {
      status: [],
      priority: [],
      assignees: [],
      projects: [],
      tags: [],
      dueDate: {}
    },
    sortBy: 'updatedAt',
    sortOrder: 'desc',
    viewMode: 'list'
  }),

  getters: {
    filteredTasks: (state) => {
      let filtered = [...state.tasks]

      // Apply search
      if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase()
        filtered = filtered.filter(task =>
          task.title.toLowerCase().includes(query) ||
          task.description.toLowerCase().includes(query) ||
          task.tags.some(tag => tag.toLowerCase().includes(query))
        )
      }

      // Apply filters
      if (state.filters.status.length > 0) {
        filtered = filtered.filter(task => state.filters.status.includes(task.status))
      }

      if (state.filters.priority.length > 0) {
        filtered = filtered.filter(task => state.filters.priority.includes(task.priority))
      }

      if (state.filters.assignees.length > 0) {
        filtered = filtered.filter(task =>
          task.assignees.some(assignee => state.filters.assignees.includes(assignee))
        )
      }

      if (state.filters.projects.length > 0) {
        filtered = filtered.filter(task => state.filters.projects.includes(task.projectId))
      }

      if (state.filters.tags.length > 0) {
        filtered = filtered.filter(task =>
          state.filters.tags.some(tag => task.tags.includes(tag))
        )
      }

      // Apply date range filter
      if (state.filters.dueDate.start || state.filters.dueDate.end) {
        filtered = filtered.filter(task => {
          if (!task.dueDate) return false
          
          const dueDate = new Date(task.dueDate)
          
          if (state.filters.dueDate.start && dueDate < state.filters.dueDate.start) {
            return false
          }
          
          if (state.filters.dueDate.end && dueDate > state.filters.dueDate.end) {
            return false
          }
          
          return true
        })
      }

      // Apply sorting
      filtered.sort((a, b) => {
        let aValue: any = a[state.sortBy]
        let bValue: any = b[state.sortBy]

        // Handle date values
        if (aValue instanceof Date) {
          aValue = aValue.getTime()
          bValue = bValue?.getTime() || 0
        } else if (state.sortBy === 'dueDate') {
          aValue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
          bValue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
        }

        // Handle string values
        if (typeof aValue === 'string') {
          aValue = aValue.toLowerCase()
          bValue = bValue.toLowerCase()
        }

        if (state.sortOrder === 'asc') {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
        } else {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
        }
      })

      return filtered
    },

    tasksByStatus: (state) => {
      const grouped: Record<TaskStatus, Task[]> = {
        [TaskStatus.TODO]: [],
        [TaskStatus.IN_PROGRESS]: [],
        [TaskStatus.IN_REVIEW]: [],
        [TaskStatus.DONE]: [],
        [TaskStatus.CANCELLED]: []
      }

      state.tasks.forEach(task => {
        if (grouped[task.status]) {
          grouped[task.status].push(task)
        }
      })

      return grouped
    },

    tasksByProject: (state) => {
      return (projectId: string) => state.tasks.filter(task => task.projectId === projectId)
    },

    tasksByAssignee: (state) => {
      return (userId: string) => state.tasks.filter(task => task.assignees.includes(userId))
    },

    overdueTasks: (state) => {
      const now = new Date()
      return state.tasks.filter(task =>
        task.dueDate &&
        new Date(task.dueDate) < now &&
        task.status !== TaskStatus.DONE &&
        task.status !== TaskStatus.CANCELLED
      )
    },

    dueSoonTasks: (state) => {
      const now = new Date()
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      
      return state.tasks.filter(task =>
        task.dueDate &&
        new Date(task.dueDate) <= nextWeek &&
        new Date(task.dueDate) >= now &&
        task.status !== TaskStatus.DONE &&
        task.status !== TaskStatus.CANCELLED
      )
    },

    taskStats: (state) => {
      const total = state.tasks.length
      const completed = state.tasks.filter(t => t.status === TaskStatus.DONE).length
      const inProgress = state.tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length
      const todo = state.tasks.filter(t => t.status === TaskStatus.TODO).length
      const overdue = state.tasks.filter(t => {
        if (!t.dueDate || t.status === TaskStatus.DONE || t.status === TaskStatus.CANCELLED) return false
        return new Date(t.dueDate) < new Date()
      }).length

      return {
        total,
        completed,
        inProgress,
        todo,
        overdue,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
      }
    },

    subtasks: (state) => {
      return (parentTaskId: string) => state.tasks.filter(task => task.parentTaskId === parentTaskId)
    }
  },

  actions: {
    async fetchTasks(projectId?: string) {
      this.isLoading = true
      this.error = null

      try {
        const url = projectId ? `/api/projects/${projectId}/tasks` : '/api/tasks'
        const { data } = await $fetch<{ tasks: Task[] }>(url)
        this.tasks = data.tasks
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to fetch tasks'
        console.error('Fetch tasks error:', error)
      } finally {
        this.isLoading = false
      }
    },

    async fetchTask(id: string) {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ task: Task }>(`/api/tasks/${id}`)
        this.currentTask = data.task

        // Update task in the list if it exists
        const index = this.tasks.findIndex(t => t.id === id)
        if (index !== -1) {
          this.tasks[index] = data.task
        } else {
          this.tasks.push(data.task)
        }

        return data.task
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to fetch task'
        console.error('Fetch task error:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async createTask(taskData: Partial<Task>) {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ task: Task }>('/api/tasks', {
          method: 'POST',
          body: taskData
        })

        this.tasks.unshift(data.task)
        return data.task
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to create task'
        console.error('Create task error:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async updateTask(id: string, updates: Partial<Task>) {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ task: Task }>(`/api/tasks/${id}`, {
          method: 'PUT',
          body: updates
        })

        // Update task in the list
        const index = this.tasks.findIndex(t => t.id === id)
        if (index !== -1) {
          this.tasks[index] = data.task
        }

        // Update current task if it's the same
        if (this.currentTask?.id === id) {
          this.currentTask = data.task
        }

        return data.task
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to update task'
        console.error('Update task error:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async deleteTask(id: string) {
      this.isLoading = true
      this.error = null

      try {
        await $fetch(`/api/tasks/${id}`, {
          method: 'DELETE'
        })

        // Remove task from the list
        this.tasks = this.tasks.filter(t => t.id !== id)

        // Clear current task if it's the same
        if (this.currentTask?.id === id) {
          this.currentTask = null
        }
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to delete task'
        console.error('Delete task error:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async moveTask(taskId: string, newStatus: TaskStatus, newPosition?: number) {
      try {
        const { data } = await $fetch<{ task: Task }>(`/api/tasks/${taskId}/move`, {
          method: 'PUT',
          body: { status: newStatus, position: newPosition }
        })

        // Update task in the list
        const index = this.tasks.findIndex(t => t.id === taskId)
        if (index !== -1) {
          this.tasks[index] = data.task
        }

        return data.task
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to move task'
        console.error('Move task error:', error)
        throw error
      }
    },

    async addComment(taskId: string, content: string, parentId?: string) {
      try {
        const { data } = await $fetch<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
          method: 'POST',
          body: { content, parentId }
        })

        // Update task comments
        const task = this.tasks.find(t => t.id === taskId)
        if (task) {
          task.comments.push(data.comment)
        }

        if (this.currentTask?.id === taskId) {
          this.currentTask.comments.push(data.comment)
        }

        return data.comment
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to add comment'
        console.error('Add comment error:', error)
        throw error
      }
    },

    async addAttachment(taskId: string, file: File) {
      try {
        const formData = new FormData()
        formData.append('file', file)

        const { data } = await $fetch<{ attachment: Attachment }>(`/api/tasks/${taskId}/attachments`, {
          method: 'POST',
          body: formData
        })

        // Update task attachments
        const task = this.tasks.find(t => t.id === taskId)
        if (task) {
          task.attachments.push(data.attachment)
        }

        if (this.currentTask?.id === taskId) {
          this.currentTask.attachments.push(data.attachment)
        }

        return data.attachment
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to add attachment'
        console.error('Add attachment error:', error)
        throw error
      }
    },

    async logTime(taskId: string, timeEntry: Partial<TimeEntry>) {
      try {
        const { data } = await $fetch<{ timeEntry: TimeEntry }>(`/api/tasks/${taskId}/time`, {
          method: 'POST',
          body: timeEntry
        })

        return data.timeEntry
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to log time'
        console.error('Log time error:', error)
        throw error
      }
    },

    setCurrentTask(task: Task | null) {
      this.currentTask = task
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    setFilters(filters: Partial<TasksState['filters']>) {
      this.filters = { ...this.filters, ...filters }
    },

    clearFilters() {
      this.filters = {
        status: [],
        priority: [],
        assignees: [],
        projects: [],
        tags: [],
        dueDate: {}
      }
      this.searchQuery = ''
    },

    setSorting(sortBy: TasksState['sortBy'], sortOrder: TasksState['sortOrder'] = 'desc') {
      this.sortBy = sortBy
      this.sortOrder = sortOrder
    },

    setViewMode(mode: TasksState['viewMode']) {
      this.viewMode = mode
    },

    clearError() {
      this.error = null
    }
  }
})