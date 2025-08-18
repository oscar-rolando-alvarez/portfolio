<template>
  <div class="space-y-6">
    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          Welcome back, {{ user?.name?.split(' ')[0] }}!
        </h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Here's what's happening with your projects today.
        </p>
      </div>
      
      <div class="mt-4 sm:mt-0 flex space-x-3">
        <UButton
          icon="heroicons:plus"
          @click="openTaskModal"
          color="primary"
        >
          New Task
        </UButton>
        
        <UButton
          icon="heroicons:folder-plus"
          @click="openProjectModal"
          variant="outline"
        >
          New Project
        </UButton>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatsCard
        title="Active Projects"
        :value="projectStats.active"
        :total="projectStats.total"
        icon="heroicons:folder"
        color="blue"
        :trend="{ value: 12, isPositive: true }"
      />
      
      <StatsCard
        title="Tasks in Progress"
        :value="taskStats.inProgress"
        :total="taskStats.total"
        icon="heroicons:clipboard-document-list"
        color="orange"
        :trend="{ value: 8, isPositive: true }"
      />
      
      <StatsCard
        title="Completed Tasks"
        :value="taskStats.completed"
        :total="taskStats.total"
        icon="heroicons:check-circle"
        color="green"
        :trend="{ value: 15, isPositive: true }"
      />
      
      <StatsCard
        title="Overdue Tasks"
        :value="overdueTasks.length"
        icon="heroicons:exclamation-triangle"
        color="red"
        :trend="{ value: 3, isPositive: false }"
      />
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left Column -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Recent Activity -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Recent Activity
            </h3>
          </div>
          <div class="p-6">
            <ActivityFeed :activities="recentActivities" />
          </div>
        </div>

        <!-- Project Progress -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Project Progress
            </h3>
            <NuxtLink
              to="/projects"
              class="text-sm text-primary-600 hover:text-primary-500"
            >
              View all
            </NuxtLink>
          </div>
          <div class="p-6">
            <ProjectProgressList :projects="activeProjects.slice(0, 5)" />
          </div>
        </div>
      </div>

      <!-- Right Column -->
      <div class="space-y-6">
        <!-- My Tasks -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              My Tasks
            </h3>
            <NuxtLink
              to="/tasks"
              class="text-sm text-primary-600 hover:text-primary-500"
            >
              View all
            </NuxtLink>
          </div>
          <div class="p-6">
            <TaskList :tasks="myTasks.slice(0, 8)" show-project compact />
          </div>
        </div>

        <!-- Upcoming Deadlines -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Upcoming Deadlines
            </h3>
          </div>
          <div class="p-6">
            <DeadlinesList :tasks="dueSoonTasks" />
          </div>
        </div>

        <!-- Team Members -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Team Members
            </h3>
          </div>
          <div class="p-6">
            <TeamMembersList :members="teamMembers.slice(0, 6)" />
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-lg font-medium text-gray-900 dark:text-white">
          Quick Actions
        </h3>
      </div>
      <div class="p-6">
        <QuickActions />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useProjectsStore } from '~/stores/projects'
import { useTasksStore } from '~/stores/tasks'
import { useUIStore } from '~/stores/ui'

// Page meta
definePageMeta({
  middleware: 'auth',
  title: 'Dashboard'
})

// Stores
const authStore = useAuthStore()
const projectsStore = useProjectsStore()
const tasksStore = useTasksStore()
const uiStore = useUIStore()

// Reactive state
const { user } = storeToRefs(authStore)
const { activeProjects, projectStats } = storeToRefs(projectsStore)
const { taskStats, overdueTasks, dueSoonTasks } = storeToRefs(tasksStore)

// Computed properties
const myTasks = computed(() => {
  return tasksStore.tasksByAssignee(user.value?.id || '')
    .filter(task => task.status !== 'done' && task.status !== 'cancelled')
    .sort((a, b) => {
      // Sort by priority first, then by due date
      if (a.priority !== b.priority) {
        return b.priority - a.priority
      }
      if (a.dueDate && b.dueDate) {
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
      }
      return 0
    })
})

const recentActivities = computed(() => {
  // This would come from an activities store in a real app
  return [
    {
      id: '1',
      type: 'task_completed',
      userId: user.value?.id,
      message: 'completed task "Design homepage mockup"',
      createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      projectId: '1'
    },
    {
      id: '2',
      type: 'project_created',
      userId: user.value?.id,
      message: 'created project "Mobile App Redesign"',
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      projectId: '2'
    }
  ]
})

const teamMembers = computed(() => {
  // This would come from a teams store in a real app
  return [
    {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
      avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=32&h=32&fit=crop&crop=face',
      role: 'Frontend Developer',
      isOnline: true
    },
    {
      id: '2',
      name: 'Jane Smith',
      email: 'jane@example.com',
      avatar: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=32&h=32&fit=crop&crop=face',
      role: 'UI Designer',
      isOnline: false
    }
  ]
})

// Methods
const openTaskModal = () => {
  uiStore.openTaskModal('create')
}

const openProjectModal = () => {
  uiStore.openProjectModal('create')
}

// Initialize data
onMounted(async () => {
  // Fetch initial data
  await Promise.all([
    projectsStore.fetchProjects(),
    tasksStore.fetchTasks()
  ])
})

// SEO
useHead({
  title: 'Dashboard'
})
</script>