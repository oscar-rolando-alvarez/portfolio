<template>
  <div class="space-y-4">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          Tasks
        </h1>
        <p class="text-sm text-muted">
          Drag cards between columns to update their status.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <USwitch
          v-model="onlyMine"
          label="Only my tasks"
        />
        <UFieldGroup>
          <UButton
            v-for="option in viewOptions"
            :key="option.value"
            :icon="option.icon"
            :aria-label="option.label"
            :color="viewMode === option.value ? 'primary' : 'neutral'"
            :variant="viewMode === option.value ? 'solid' : 'outline'"
            @click="viewMode = option.value"
          />
        </UFieldGroup>
        <UButton
          v-if="canEdit"
          icon="i-lucide-plus"
          label="New task"
          @click="openCreate('todo')"
        />
      </div>
    </div>

    <KanbanBoard
      v-if="viewMode === 'kanban'"
      :tasks="visibleTasks"
      :can-edit="canEdit"
      @move="onMove"
      @add-task="openCreate"
    />
    <UCard v-else>
      <TaskList
        :tasks="visibleTasks"
        show-project
        empty-text="No tasks match the current filters."
      />
    </UCard>

    <div class="flex flex-wrap items-center gap-6 text-sm text-muted">
      <span>Total: {{ taskStats.total }}</span>
      <span>In progress: {{ taskStats.inProgress }}</span>
      <span>Completed: {{ taskStats.completed }}</span>
      <span class="text-error">Overdue: {{ taskStats.overdue }}</span>
      <span class="flex items-center gap-2">
        Completion
        <UProgress
          :model-value="taskStats.completionRate"
          size="sm"
          class="w-24"
        />
        {{ taskStats.completionRate }}%
      </span>
    </div>

    <TaskCreateModal
      v-model:open="createOpen"
      :status="createStatus"
    />
  </div>
</template>

<script setup lang="ts">
import type { TaskStatus } from '#shared/types'
import type { TaskViewMode } from '~/stores/tasks'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Tasks' })

const auth = useAuthStore()
const tasksStore = useTasksStore()
const { user, canEdit } = storeToRefs(auth)
const { filteredTasks, taskStats, viewMode } = storeToRefs(tasksStore)
const toast = useToast()

const onlyMine = ref(false)
const createOpen = ref(false)
const createStatus = ref<TaskStatus>('todo')

const viewOptions: { value: TaskViewMode, label: string, icon: string }[] = [
  { value: 'kanban', label: 'Board view', icon: 'i-lucide-columns-3' },
  { value: 'list', label: 'List view', icon: 'i-lucide-list' }
]

const visibleTasks = computed(() =>
  onlyMine.value && user.value
    ? filteredTasks.value.filter(t => t.assigneeIds.includes(user.value!.id))
    : filteredTasks.value
)

function openCreate(status: TaskStatus) {
  createStatus.value = status
  createOpen.value = true
}

async function onMove(taskId: string, status: TaskStatus, position: number) {
  try {
    await tasksStore.moveTask(taskId, status, position)
  } catch {
    toast.add({ title: 'Could not move task', description: 'The change was reverted.', color: 'error' })
  }
}

await useWorkspaceData()
</script>
