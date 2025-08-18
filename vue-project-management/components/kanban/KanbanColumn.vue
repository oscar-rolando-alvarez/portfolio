<template>
  <div class="flex flex-col w-80 bg-gray-50 dark:bg-gray-800 rounded-lg m-2">
    <!-- Column Header -->
    <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-center space-x-2">
        <div
          class="w-3 h-3 rounded-full"
          :class="getColorClasses(color)"
        ></div>
        <h3 class="font-medium text-gray-900 dark:text-white">
          {{ title }}
        </h3>
        <UBadge
          :label="tasks.length.toString()"
          :color="color"
          variant="soft"
          size="xs"
        />
      </div>

      <UDropdown
        :items="columnMenuItems"
        :popper="{ placement: 'bottom-end' }"
      >
        <UButton
          icon="heroicons:ellipsis-horizontal"
          variant="ghost"
          size="xs"
        />
      </UDropdown>
    </div>

    <!-- Tasks List -->
    <div
      ref="columnRef"
      class="flex-1 p-2 space-y-2 overflow-y-auto min-h-24"
      @drop="handleDrop"
      @dragover.prevent
      @dragenter.prevent
      :class="{ 'bg-blue-50 dark:bg-blue-900/20': isDragOver }"
    >
      <KanbanCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        draggable="true"
        @dragstart="handleDragStart($event, task)"
        @dragend="handleDragEnd"
        @click="$emit('task-click', task)"
      />

      <!-- Empty State -->
      <div
        v-if="tasks.length === 0"
        class="flex flex-col items-center justify-center py-8 text-center"
      >
        <Icon
          name="heroicons:document-plus"
          class="w-8 h-8 text-gray-400 dark:text-gray-500 mb-2"
        />
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
          No tasks in {{ title.toLowerCase() }}
        </p>
        <UButton
          size="xs"
          variant="ghost"
          @click="$emit('add-task', status)"
        >
          Add a task
        </UButton>
      </div>
    </div>

    <!-- Add Task Button -->
    <div class="p-2">
      <UButton
        block
        variant="ghost"
        size="sm"
        icon="heroicons:plus"
        @click="$emit('add-task', status)"
      >
        Add task
      </UButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Task, TaskStatus } from '~/types'

interface Props {
  status: TaskStatus
  title: string
  tasks: Task[]
  color: string
}

const props = defineProps<Props>()

// Emits
defineEmits<{
  'task-moved': [taskId: string, newStatus: TaskStatus, newPosition: number]
  'task-click': [task: Task]
  'add-task': [status: TaskStatus]
}>()

// Reactive state
const columnRef = ref<HTMLElement>()
const isDragOver = ref(false)
const draggedTask = ref<Task | null>(null)

// Column menu items
const columnMenuItems = [
  [{
    label: 'Add task',
    icon: 'heroicons:plus',
    click: () => emit('add-task', props.status)
  }],
  [{
    label: 'Sort by priority',
    icon: 'heroicons:flag',
    click: () => sortByPriority()
  }, {
    label: 'Sort by due date',
    icon: 'heroicons:calendar',
    click: () => sortByDueDate()
  }],
  [{
    label: 'Clear completed',
    icon: 'heroicons:trash',
    disabled: props.status !== TaskStatus.DONE,
    click: () => clearCompleted()
  }]
]

// Methods
const getColorClasses = (color: string): string => {
  const colorMap = {
    gray: 'bg-gray-400',
    blue: 'bg-blue-400',
    orange: 'bg-orange-400',
    green: 'bg-green-400',
    red: 'bg-red-400'
  }
  return colorMap[color as keyof typeof colorMap] || 'bg-gray-400'
}

const handleDragStart = (event: DragEvent, task: Task) => {
  draggedTask.value = task
  event.dataTransfer?.setData('text/plain', task.id)
  event.dataTransfer!.effectAllowed = 'move'
  
  // Add visual feedback
  const target = event.target as HTMLElement
  target.style.opacity = '0.5'
}

const handleDragEnd = (event: DragEvent) => {
  // Reset visual feedback
  const target = event.target as HTMLElement
  target.style.opacity = '1'
  
  draggedTask.value = null
  isDragOver.value = false
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false
  
  const taskId = event.dataTransfer?.getData('text/plain')
  if (!taskId || !draggedTask.value) return
  
  // Don't do anything if dropping on the same column
  if (draggedTask.value.status === props.status) return
  
  // Calculate new position based on drop location
  const columnElement = columnRef.value
  if (!columnElement) return
  
  const rect = columnElement.getBoundingClientRect()
  const y = event.clientY - rect.top
  const cards = columnElement.querySelectorAll('[draggable="true"]')
  
  let newPosition = 0
  for (let i = 0; i < cards.length; i++) {
    const cardRect = cards[i].getBoundingClientRect()
    const cardY = cardRect.top - rect.top
    
    if (y > cardY + cardRect.height / 2) {
      newPosition = i + 1
    } else {
      break
    }
  }
  
  // Emit the move event
  emit('task-moved', taskId, props.status, newPosition)
}

// Handle drag over for visual feedback
const handleDragOver = () => {
  isDragOver.value = true
}

const handleDragLeave = (event: DragEvent) => {
  // Only remove feedback if leaving the column entirely
  const rect = columnRef.value?.getBoundingClientRect()
  if (!rect) return
  
  const { clientX, clientY } = event
  if (
    clientX < rect.left ||
    clientX > rect.right ||
    clientY < rect.top ||
    clientY > rect.bottom
  ) {
    isDragOver.value = false
  }
}

// Column actions
const sortByPriority = () => {
  // This would trigger a store action to sort tasks by priority
  console.log('Sort by priority')
}

const sortByDueDate = () => {
  // This would trigger a store action to sort tasks by due date
  console.log('Sort by due date')
}

const clearCompleted = () => {
  // This would trigger a store action to archive/delete completed tasks
  console.log('Clear completed tasks')
}

// Add event listeners for better drag feedback
onMounted(() => {
  const column = columnRef.value
  if (column) {
    column.addEventListener('dragover', handleDragOver)
    column.addEventListener('dragleave', handleDragLeave)
  }
})

onUnmounted(() => {
  const column = columnRef.value
  if (column) {
    column.removeEventListener('dragover', handleDragOver)
    column.removeEventListener('dragleave', handleDragLeave)
  }
})
</script>

<style scoped>
/* Smooth transitions for drag states */
.transition-colors {
  transition-property: background-color, border-color;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

/* Custom scrollbar for task list */
.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-muted);
}
</style>