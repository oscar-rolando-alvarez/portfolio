<template>
  <div
    class="bg-white dark:bg-gray-700 rounded-lg shadow-sm border border-gray-200 dark:border-gray-600 p-3 cursor-pointer hover:shadow-md transition-shadow duration-200"
    :class="{ 'ring-2 ring-primary-500': isSelected }"
    @click="$emit('click', task)"
  >
    <!-- Task Header -->
    <div class="flex items-start justify-between mb-2">
      <div class="flex-1 min-w-0">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white truncate">
          {{ task.title }}
        </h4>
        <p
          v-if="task.description"
          class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2"
        >
          {{ task.description }}
        </p>
      </div>
      
      <UDropdown
        :items="taskMenuItems"
        :popper="{ placement: 'bottom-end' }"
        @click.stop
      >
        <UButton
          icon="heroicons:ellipsis-horizontal"
          variant="ghost"
          size="xs"
          class="ml-2"
        />
      </UDropdown>
    </div>

    <!-- Task Metadata -->
    <div class="space-y-2">
      <!-- Priority and Tags -->
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-1">
          <PriorityBadge
            v-if="task.priority > 1"
            :priority="task.priority"
            size="xs"
          />
          
          <UBadge
            v-for="tag in task.tags.slice(0, 2)"
            :key="tag"
            :label="tag"
            size="xs"
            variant="soft"
            color="gray"
          />
          
          <span
            v-if="task.tags.length > 2"
            class="text-xs text-gray-400"
          >
            +{{ task.tags.length - 2 }}
          </span>
        </div>

        <!-- Task Stats -->
        <div class="flex items-center space-x-1 text-xs text-gray-500 dark:text-gray-400">
          <Icon
            v-if="task.comments.length > 0"
            name="heroicons:chat-bubble-left"
            class="w-3 h-3"
          />
          <span v-if="task.comments.length > 0">{{ task.comments.length }}</span>
          
          <Icon
            v-if="task.attachments.length > 0"
            name="heroicons:paper-clip"
            class="w-3 h-3"
          />
          <span v-if="task.attachments.length > 0">{{ task.attachments.length }}</span>
          
          <Icon
            v-if="task.subtasks.length > 0"
            name="heroicons:queue-list"
            class="w-3 h-3"
          />
          <span v-if="task.subtasks.length > 0">{{ completedSubtasks }}/{{ task.subtasks.length }}</span>
        </div>
      </div>

      <!-- Progress Bar -->
      <div
        v-if="task.progress > 0 || task.subtasks.length > 0"
        class="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"
      >
        <div
          class="bg-primary-500 h-1.5 rounded-full transition-all duration-300"
          :style="{ width: `${progressPercentage}%` }"
        ></div>
      </div>

      <!-- Due Date -->
      <div
        v-if="task.dueDate"
        class="flex items-center text-xs"
        :class="dueDateClasses"
      >
        <Icon name="heroicons:calendar" class="w-3 h-3 mr-1" />
        <span>{{ formatDueDate(task.dueDate) }}</span>
      </div>

      <!-- Assignees -->
      <div v-if="task.assignees.length > 0" class="flex items-center justify-between">
        <div class="flex -space-x-1">
          <img
            v-for="(assignee, index) in task.assignees.slice(0, 3)"
            :key="assignee"
            :src="getAssigneeAvatar(assignee)"
            :alt="getAssigneeName(assignee)"
            class="w-6 h-6 rounded-full border-2 border-white dark:border-gray-700"
            :class="{ 'z-10': index === 0, 'z-20': index === 1, 'z-30': index === 2 }"
          />
          <div
            v-if="task.assignees.length > 3"
            class="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-600 border-2 border-white dark:border-gray-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300 z-40"
          >
            +{{ task.assignees.length - 3 }}
          </div>
        </div>

        <!-- Time Tracking -->
        <div
          v-if="task.estimatedTime || task.actualTime"
          class="text-xs text-gray-500 dark:text-gray-400"
        >
          <Icon name="heroicons:clock" class="w-3 h-3 inline mr-1" />
          <span v-if="task.actualTime">{{ formatTime(task.actualTime) }}</span>
          <span v-else-if="task.estimatedTime">{{ formatTime(task.estimatedTime) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Task } from '~/types'
import { format, isToday, isTomorrow, isYesterday, isPast } from 'date-fns'

interface Props {
  task: Task
  isSelected?: boolean
}

const props = defineProps<Props>()

// Emits
defineEmits<{
  click: [task: Task]
}>()

// Task menu items
const taskMenuItems = [
  [{
    label: 'Edit',
    icon: 'heroicons:pencil',
    click: () => editTask()
  }, {
    label: 'Duplicate',
    icon: 'heroicons:document-duplicate',
    click: () => duplicateTask()
  }],
  [{
    label: 'Move to...',
    icon: 'heroicons:arrow-right',
    click: () => moveTask()
  }, {
    label: 'Convert to project',
    icon: 'heroicons:folder',
    click: () => convertToProject()
  }],
  [{
    label: 'Archive',
    icon: 'heroicons:archive-box',
    click: () => archiveTask()
  }, {
    label: 'Delete',
    icon: 'heroicons:trash',
    click: () => deleteTask()
  }]
]

// Computed properties
const completedSubtasks = computed(() => {
  return props.task.subtasks.filter(subtask => subtask.status === 'done').length
})

const progressPercentage = computed(() => {
  if (props.task.subtasks.length > 0) {
    return (completedSubtasks.value / props.task.subtasks.length) * 100
  }
  return props.task.progress
})

const dueDateClasses = computed(() => {
  if (!props.task.dueDate) return ''
  
  const dueDate = new Date(props.task.dueDate)
  const now = new Date()
  
  if (isPast(dueDate) && props.task.status !== 'done') {
    return 'text-red-600 dark:text-red-400'
  } else if (isToday(dueDate)) {
    return 'text-orange-600 dark:text-orange-400'
  } else if (isTomorrow(dueDate)) {
    return 'text-yellow-600 dark:text-yellow-400'
  } else {
    return 'text-gray-500 dark:text-gray-400'
  }
})

// Methods
const formatDueDate = (date: Date): string => {
  const dueDate = new Date(date)
  
  if (isToday(dueDate)) return 'Today'
  if (isTomorrow(dueDate)) return 'Tomorrow'
  if (isYesterday(dueDate)) return 'Yesterday'
  
  return format(dueDate, 'MMM d')
}

const formatTime = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes}m`
  }
  
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  
  if (remainingMinutes === 0) {
    return `${hours}h`
  }
  
  return `${hours}h ${remainingMinutes}m`
}

const getAssigneeAvatar = (assigneeId: string): string => {
  // In a real app, this would come from a users store
  return `https://ui-avatars.com/api/?name=${assigneeId}&size=24&background=6366f1&color=fff`
}

const getAssigneeName = (assigneeId: string): string => {
  // In a real app, this would come from a users store
  return `User ${assigneeId}`
}

// Task actions
const editTask = () => {
  const uiStore = useUIStore()
  uiStore.openTaskModal('edit', props.task.id)
}

const duplicateTask = () => {
  console.log('Duplicate task:', props.task.id)
}

const moveTask = () => {
  console.log('Move task:', props.task.id)
}

const convertToProject = () => {
  console.log('Convert to project:', props.task.id)
}

const archiveTask = () => {
  console.log('Archive task:', props.task.id)
}

const deleteTask = () => {
  const uiStore = useUIStore()
  uiStore.openConfirmDialog({
    title: 'Delete Task',
    message: 'Are you sure you want to delete this task? This action cannot be undone.',
    confirmText: 'Delete',
    variant: 'danger',
    onConfirm: async () => {
      const tasksStore = useTasksStore()
      await tasksStore.deleteTask(props.task.id)
    }
  })
}
</script>

<style scoped>
/* Line clamp utility for description */
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Smooth hover transitions */
.transition-shadow {
  transition-property: box-shadow;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 200ms;
}
</style>