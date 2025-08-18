import { defineStore } from 'pinia'
import type { Project, ProjectStatus, Priority, ProjectMember } from '~/types'

interface ProjectsState {
  projects: Project[]
  currentProject: Project | null
  isLoading: boolean
  error: string | null
  searchQuery: string
  filters: {
    status: ProjectStatus[]
    priority: Priority[]
    members: string[]
    tags: string[]
  }
  sortBy: 'name' | 'createdAt' | 'updatedAt' | 'priority' | 'progress'
  sortOrder: 'asc' | 'desc'
}

export const useProjectsStore = defineStore('projects', {
  state: (): ProjectsState => ({
    projects: [],
    currentProject: null,
    isLoading: false,
    error: null,
    searchQuery: '',
    filters: {
      status: [],
      priority: [],
      members: [],
      tags: []
    },
    sortBy: 'updatedAt',
    sortOrder: 'desc'
  }),

  getters: {
    filteredProjects: (state) => {
      let filtered = [...state.projects]

      // Apply search
      if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase()
        filtered = filtered.filter(project =>
          project.name.toLowerCase().includes(query) ||
          project.description.toLowerCase().includes(query) ||
          project.tags.some(tag => tag.toLowerCase().includes(query))
        )
      }

      // Apply filters
      if (state.filters.status.length > 0) {
        filtered = filtered.filter(project => state.filters.status.includes(project.status))
      }

      if (state.filters.priority.length > 0) {
        filtered = filtered.filter(project => state.filters.priority.includes(project.priority))
      }

      if (state.filters.members.length > 0) {
        filtered = filtered.filter(project =>
          project.team.some(member => state.filters.members.includes(member.userId))
        )
      }

      if (state.filters.tags.length > 0) {
        filtered = filtered.filter(project =>
          state.filters.tags.some(tag => project.tags.includes(tag))
        )
      }

      // Apply sorting
      filtered.sort((a, b) => {
        let aValue: any = a[state.sortBy]
        let bValue: any = b[state.sortBy]

        // Handle date values
        if (aValue instanceof Date) {
          aValue = aValue.getTime()
          bValue = bValue.getTime()
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

    activeProjects: (state) => {
      return state.projects.filter(project => project.status === ProjectStatus.ACTIVE)
    },

    completedProjects: (state) => {
      return state.projects.filter(project => project.status === ProjectStatus.COMPLETED)
    },

    projectById: (state) => {
      return (id: string) => state.projects.find(project => project.id === id)
    },

    projectsByStatus: (state) => {
      return (status: ProjectStatus) => state.projects.filter(project => project.status === status)
    },

    userProjects: (state) => {
      return (userId: string) => state.projects.filter(project =>
        project.createdBy === userId ||
        project.team.some(member => member.userId === userId)
      )
    },

    projectStats: (state) => {
      const total = state.projects.length
      const active = state.projects.filter(p => p.status === ProjectStatus.ACTIVE).length
      const completed = state.projects.filter(p => p.status === ProjectStatus.COMPLETED).length
      const onHold = state.projects.filter(p => p.status === ProjectStatus.ON_HOLD).length
      const planning = state.projects.filter(p => p.status === ProjectStatus.PLANNING).length

      return {
        total,
        active,
        completed,
        onHold,
        planning,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
      }
    }
  },

  actions: {
    async fetchProjects() {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ projects: Project[] }>('/api/projects')
        this.projects = data.projects
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to fetch projects'
        console.error('Fetch projects error:', error)
      } finally {
        this.isLoading = false
      }
    },

    async fetchProject(id: string) {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ project: Project }>(`/api/projects/${id}`)
        this.currentProject = data.project

        // Update project in the list if it exists
        const index = this.projects.findIndex(p => p.id === id)
        if (index !== -1) {
          this.projects[index] = data.project
        } else {
          this.projects.push(data.project)
        }

        return data.project
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to fetch project'
        console.error('Fetch project error:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async createProject(projectData: Partial<Project>) {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ project: Project }>('/api/projects', {
          method: 'POST',
          body: projectData
        })

        this.projects.unshift(data.project)
        return data.project
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to create project'
        console.error('Create project error:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async updateProject(id: string, updates: Partial<Project>) {
      this.isLoading = true
      this.error = null

      try {
        const { data } = await $fetch<{ project: Project }>(`/api/projects/${id}`, {
          method: 'PUT',
          body: updates
        })

        // Update project in the list
        const index = this.projects.findIndex(p => p.id === id)
        if (index !== -1) {
          this.projects[index] = data.project
        }

        // Update current project if it's the same
        if (this.currentProject?.id === id) {
          this.currentProject = data.project
        }

        return data.project
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to update project'
        console.error('Update project error:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async deleteProject(id: string) {
      this.isLoading = true
      this.error = null

      try {
        await $fetch(`/api/projects/${id}`, {
          method: 'DELETE'
        })

        // Remove project from the list
        this.projects = this.projects.filter(p => p.id !== id)

        // Clear current project if it's the same
        if (this.currentProject?.id === id) {
          this.currentProject = null
        }
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to delete project'
        console.error('Delete project error:', error)
        throw error
      } finally {
        this.isLoading = false
      }
    },

    async addTeamMember(projectId: string, member: ProjectMember) {
      try {
        const { data } = await $fetch<{ project: Project }>(`/api/projects/${projectId}/members`, {
          method: 'POST',
          body: member
        })

        // Update project in the list
        const index = this.projects.findIndex(p => p.id === projectId)
        if (index !== -1) {
          this.projects[index] = data.project
        }

        // Update current project if it's the same
        if (this.currentProject?.id === projectId) {
          this.currentProject = data.project
        }

        return data.project
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to add team member'
        console.error('Add team member error:', error)
        throw error
      }
    },

    async removeTeamMember(projectId: string, userId: string) {
      try {
        const { data } = await $fetch<{ project: Project }>(`/api/projects/${projectId}/members/${userId}`, {
          method: 'DELETE'
        })

        // Update project in the list
        const index = this.projects.findIndex(p => p.id === projectId)
        if (index !== -1) {
          this.projects[index] = data.project
        }

        // Update current project if it's the same
        if (this.currentProject?.id === projectId) {
          this.currentProject = data.project
        }

        return data.project
      } catch (error: any) {
        this.error = error.data?.message || 'Failed to remove team member'
        console.error('Remove team member error:', error)
        throw error
      }
    },

    setCurrentProject(project: Project | null) {
      this.currentProject = project
    },

    setSearchQuery(query: string) {
      this.searchQuery = query
    },

    setFilters(filters: Partial<ProjectsState['filters']>) {
      this.filters = { ...this.filters, ...filters }
    },

    clearFilters() {
      this.filters = {
        status: [],
        priority: [],
        members: [],
        tags: []
      }
      this.searchQuery = ''
    },

    setSorting(sortBy: ProjectsState['sortBy'], sortOrder: ProjectsState['sortOrder'] = 'desc') {
      this.sortBy = sortBy
      this.sortOrder = sortOrder
    },

    clearError() {
      this.error = null
    }
  }
})