<template>
  <div class="flex gap-4 overflow-x-auto pb-4">
    <KanbanColumn
      v-for="status in BOARD_STATUSES"
      :key="status"
      :status="status"
      :title="STATUS_LABELS[status]"
      :tasks="columns[status]"
      :can-edit="canEdit"
      @drop-task="onDrop"
      @add-task="emit('add-task', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { Task, TaskStatus } from '#shared/types'
import { BOARD_STATUSES } from '#shared/types'
import { STATUS_LABELS } from '#shared/utils/tasks'

const props = withDefaults(defineProps<{ tasks: Task[], canEdit?: boolean }>(), { canEdit: true })
const emit = defineEmits<{
  'move': [taskId: string, status: TaskStatus, position: number]
  'add-task': [status: TaskStatus]
}>()

const columns = computed(() => groupByStatus(props.tasks))

function onDrop(taskId: string, status: TaskStatus, position: number) {
  emit('move', taskId, status, position)
}
</script>
