<template>
  <div class="h-full flex flex-col">
    <!-- Page Header -->
    <div class="flex items-center justify-between p-6 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          My Tasks
        </h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage and track your tasks across all projects
        </p>
      </div>

      <div class="flex items-center space-x-3">
        <!-- View Toggle -->
        <div class="flex rounded-lg border border-gray-300 dark:border-gray-600">
          <button
            v-for="view in viewOptions"
            :key="view.value"
            @click="setViewMode(view.value)"
            class="px-3 py-2 text-sm font-medium transition-colors duration-200"
            :class="[
              viewMode === view.value
                ? 'bg-primary-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700',
              view.value === 'list' ? 'rounded-l-md' : '',
              view.value === 'gantt' ? 'rounded-r-md' : ''
            ]"
          >
            <Icon :name="view.icon" class="w-4 h-4" />
          </button>
        </div>

        <!-- Actions -->
        <UButton
          icon="heroicons:funnel"
          variant="outline"
          @click="showFilters = !showFilters"
        >
          Filters
        </UButton>

        <UButton
          icon="heroicons:plus"
          @click="openCreateTaskModal"
        >
          New Task
        </UButton>
      </div>
    </div>

    <!-- Filters -->
    <TaskFilters
      v-if="showFilters"
      @close="showFilters = false"
    />

    <!-- Task Views -->
    <div class="flex-1 overflow-hidden">
      <!-- Kanban View -->
      <KanbanBoard
        v-if="viewMode === 'kanban'"
        :title="pageTitle"
        :assignee-id="user?.id"
      />

      <!-- List View -->
      <TaskListView
        v-else-if="viewMode === 'list'"
        :tasks="filteredTasks"
        :loading="isLoading"
      />

      <!-- Calendar View -->
      <TaskCalendarView
        v-else-if="viewMode === 'calendar'"
        :tasks="filteredTasks"
      />

      <!-- Gantt View -->
      <TaskGanttView
        v-else-if="viewMode === 'gantt'"
        :tasks="filteredTasks"
      />
    </div>

    <!-- Task Stats Footer -->
    <div class="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
        <div class="flex items-center space-x-6">
          <span>Total: {{ taskStats.total }}</span>
          <span>In Progress: {{ taskStats.inProgress }}</span>
          <span>Completed: {{ taskStats.completed }}</span>
          <span class="text-red-600 dark:text-red-400">Overdue: {{ overdueTasks.length }}</span>
        </div>
        
        <div class="flex items-center space-x-2">
          <span>Completion Rate:</span>
          <div class="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              class="bg-green-500 h-2 rounded-full transition-all duration-300"
              :style="{ width: `${taskStats.completionRate}%` }"
            ></div>
          </div>
          <span class="font-medium">{{ taskStats.completionRate }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '~/stores/auth'
import { useTasksStore } from '~/stores/tasks'
import { useUIStore } from '~/stores/ui'

// Page meta
definePageMeta({
  middleware: 'auth',
  title: 'Tasks'
})

// Stores
const authStore = useAuthStore()
const tasksStore = useTasksStore()
const uiStore = useUIStore()

// Reactive state
const { user } = storeToRefs(authStore)
const { filteredTasks, taskStats, overdueTasks, viewMode, isLoading } = storeToRefs(tasksStore)

const showFilters = ref(false)

// View options
const viewOptions = [
  { value: 'kanban', label: 'Kanban', icon: 'heroicons:view-columns' },
  { value: 'list', label: 'List', icon: 'heroicons:queue-list' },
  { value: 'calendar', label: 'Calendar', icon: 'heroicons:calendar-days' },
  { value: 'gantt', label: 'Gantt', icon: 'heroicons:chart-bar-square' }
]

// Computed
const pageTitle = computed(() => {
  const viewLabels = {
    kanban: 'Task Board',
    list: 'Task List',
    calendar: 'Task Calendar',
    gantt: 'Task Timeline'
  }
  return viewLabels[viewMode.value]
})

// Methods
const setViewMode = (mode: typeof viewMode.value) => {
  tasksStore.setViewMode(mode)
}

const openCreateTaskModal = () => {
  uiStore.openTaskModal('create')
}

// Initialize data
onMounted(async () => {
  // Fetch user's tasks
  await tasksStore.fetchTasks()
  
  // Set initial filters to show user's tasks
  tasksStore.setFilters({
    assignees: [user.value?.id || '']
  })
})

// Cleanup filters on unmount
onUnmounted(() => {
  tasksStore.clearFilters()
})

// SEO
useHead({
  title: 'My Tasks'
})
</script>