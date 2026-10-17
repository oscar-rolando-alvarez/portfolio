import { defineStore } from 'pinia'
import type { ProjectSummary, User } from '#shared/types'

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<ProjectSummary[]>([])
  const members = ref<User[]>([])
  const loading = ref(false)

  const activeProjects = computed(() => projects.value.filter(p => p.status === 'active'))
  const projectStats = computed(() => ({
    total: projects.value.length,
    active: activeProjects.value.length
  }))

  const projectById = computed(() => new Map(projects.value.map(p => [p.id, p])))
  const memberById = computed(() => new Map(members.value.map(u => [u.id, u])))

  async function fetchAll() {
    loading.value = true
    try {
      const fetcher = useRequestFetch()
      const [p, u] = await Promise.all([
        fetcher<ProjectSummary[]>('/api/projects'),
        fetcher<User[]>('/api/users')
      ])
      projects.value = p
      members.value = u
    } finally {
      loading.value = false
    }
  }

  return { projects, members, loading, activeProjects, projectStats, projectById, memberById, fetchAll }
})
