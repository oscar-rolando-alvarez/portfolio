<template>
  <div class="flex flex-col h-full">
    <!-- Board Header -->
    <div class="flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center space-x-4">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
          {{ title }}
        </h2>
        <div class="flex items-center space-x-2">
          <UBadge
            v-for="(count, status) in statusCounts"
            :key="status"
            :label="`${getStatusLabel(status)}: ${count}`"
            :color="getStatusColor(status)"
            variant="soft"
          />
        </div>
      </div>

      <div class="flex items-center space-x-2">
        <!-- View Options -->
        <UDropdown
          :items="viewOptionsItems"
          :popper="{ placement: 'bottom-end' }"
        >
          <UButton
            icon="heroicons:adjustments-horizontal"
            variant="ghost"
            size="sm"
          >
            View
          </UButton>
        </UDropdown>

        <!-- Filters -->
        <UButton
          icon="heroicons:funnel"
          variant="ghost"
          size="sm"
          @click="showFilters = !showFilters"
        >
          Filter
        </UButton>

        <!-- Add Task -->
        <UButton
          icon="heroicons:plus"
          size="sm"
          @click="openCreateTaskModal"
        >
          Add Task
        </UButton>
      </div>
    </div>

    <!-- Filters Panel -->
    <KanbanFilters
      v-if="showFilters"
      @close="showFilters = false"
    />

    <!-- Kanban Columns -->
    <div class="flex-1 overflow-x-auto">
      <div class="flex h-full min-w-max">
        <KanbanColumn
          v-for="status in statuses"
          :key="status"
          :status="status"
          :title="getStatusLabel(status)"
          :tasks="getTasksByStatus(status)"
          :color="getStatusColor(status)"
          @task-moved="handleTaskMoved"
          @task-click="handleTaskClick"
          @add-task="handleAddTask"
        />
      </div>
    </div>

    <!-- Loading State -->
    <div
      v-if="isLoading"
      class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center z-10"
    >
      <div class="flex items-center space-x-2">
        <USpinner size="sm" />
        <span class="text-sm text-gray-600 dark:text-gray-400">Loading...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Task, TaskStatus } from '~/types'
import { useTasksStore } from '~/stores/tasks'
import { useUIStore } from '~/stores/ui'

interface Props {
  title?: string
  projectId?: string
  assigneeId?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Task Board'
})

// Stores
const tasksStore = useTasksStore()
const uiStore = useUIStore()

// Reactive state
const { tasks, isLoading, filteredTasks } = storeToRefs(tasksStore)
const showFilters = ref(false)

// Kanban statuses in order
const statuses: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
  TaskStatus.DONE
]

// Computed properties
const boardTasks = computed(() => {
  let boardTasks = filteredTasks.value

  // Filter by project if specified
  if (props.projectId) {
    boardTasks = boardTasks.filter(task => task.projectId === props.projectId)
  }

  // Filter by assignee if specified
  if (props.assigneeId) {
    boardTasks = boardTasks.filter(task => task.assignees.includes(props.assigneeId))
  }

  return boardTasks
})

const statusCounts = computed(() => {
  const counts: Record<string, number> = {}
  
  statuses.forEach(status => {
    counts[status] = getTasksByStatus(status).length
  })
  
  return counts
})

// View options dropdown items
const viewOptionsItems = [
  [{
    label: 'Show Subtasks',
    icon: 'heroicons:queue-list',
    click: () => toggleSubtasks()
  }],
  [{
    label: 'Group by Priority',
    icon: 'heroicons:flag',
    click: () => toggleGroupByPriority()
  }, {
    label: 'Group by Assignee',
    icon: 'heroicons:user',
    click: () => toggleGroupByAssignee()
  }],
  [{
    label: 'Compact View',
    icon: 'heroicons:view-columns',
    click: () => toggleCompactView()
  }]
]

// Methods
const getTasksByStatus = (status: TaskStatus): Task[] => {
  return boardTasks.value
    .filter(task => task.status === status)
    .sort((a, b) => a.position - b.position)
}

const getStatusLabel = (status: TaskStatus): string => {
  const labels = {
    [TaskStatus.TODO]: 'To Do',
    [TaskStatus.IN_PROGRESS]: 'In Progress',
    [TaskStatus.IN_REVIEW]: 'In Review',
    [TaskStatus.DONE]: 'Done',
    [TaskStatus.CANCELLED]: 'Cancelled'
  }
  return labels[status]
}

const getStatusColor = (status: TaskStatus): string => {
  const colors = {
    [TaskStatus.TODO]: 'gray',
    [TaskStatus.IN_PROGRESS]: 'blue',
    [TaskStatus.IN_REVIEW]: 'orange',
    [TaskStatus.DONE]: 'green',
    [TaskStatus.CANCELLED]: 'red'
  }
  return colors[status]
}

const handleTaskMoved = async (taskId: string, newStatus: TaskStatus, newPosition: number) => {
  try {
    await tasksStore.moveTask(taskId, newStatus, newPosition)
  } catch (error) {
    console.error('Failed to move task:', error)
    // Show error toast
    const toast = useToast()
    toast.add({
      title: 'Error',
      description: 'Failed to move task. Please try again.',
      color: 'red'
    })
  }
}

const handleTaskClick = (task: Task) => {
  uiStore.openTaskModal('view', task.id)
}

const handleAddTask = (status: TaskStatus) => {
  // Open task creation modal with pre-selected status
  uiStore.openTaskModal('create')
  // You could pass the status to pre-fill the form
}

const openCreateTaskModal = () => {
  uiStore.openTaskModal('create')
}

// View option handlers
const toggleSubtasks = () => {
  // Implementation for showing/hiding subtasks
  console.log('Toggle subtasks')
}

const toggleGroupByPriority = () => {
  // Implementation for grouping by priority
  console.log('Toggle group by priority')
}

const toggleGroupByAssignee = () => {
  // Implementation for grouping by assignee
  console.log('Toggle group by assignee')
}

const toggleCompactView = () => {
  // Implementation for compact view
  console.log('Toggle compact view')
}

// Initialize data
onMounted(async () => {
  if (props.projectId) {
    await tasksStore.fetchTasks(props.projectId)
  } else if (tasks.value.length === 0) {
    await tasksStore.fetchTasks()
  }
})
</script>

<style scoped>
/* Custom scrollbar for horizontal overflow */
.overflow-x-auto::-webkit-scrollbar {
  height: 8px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  background: var(--color-surface);
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 4px;
}

.overflow-x-auto::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
</style>