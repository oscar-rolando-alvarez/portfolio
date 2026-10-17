<template>
  <section
    class="flex w-80 shrink-0 flex-col rounded-lg bg-muted/60 transition-colors"
    :class="{ 'ring-2 ring-primary': dragOver }"
    :aria-label="`${title} column`"
    :data-status="status"
    @dragover.prevent="dragOver = true"
    @dragleave="dragOver = false"
    @drop.prevent="onDrop"
  >
    <header class="flex items-center justify-between px-3 py-2">
      <h3 class="text-sm font-semibold">
        {{ title }}
        <UBadge
          :label="String(tasks.length)"
          color="neutral"
          variant="subtle"
          size="sm"
          class="ml-1"
        />
      </h3>
      <UButton
        v-if="canEdit"
        icon="i-lucide-plus"
        size="xs"
        color="neutral"
        variant="ghost"
        :aria-label="`Add task to ${title}`"
        @click="emit('add-task', status)"
      />
    </header>
    <ol class="flex min-h-24 flex-1 flex-col gap-2 p-2">
      <li
        v-for="(task, index) in tasks"
        :key="task.id"
        @dragover.prevent="hoverIndex = index"
      >
        <KanbanCard
          :task="task"
          :draggable="canEdit"
        />
      </li>
      <li
        v-if="tasks.length === 0"
        class="rounded-md border border-dashed border-default p-4 text-center text-xs text-muted"
      >
        Drop tasks here
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import type { Task, TaskStatus } from '#shared/types'

const props = defineProps<{ status: TaskStatus, title: string, tasks: Task[], canEdit: boolean }>()
const emit = defineEmits<{
  'drop-task': [taskId: string, status: TaskStatus, position: number]
  'add-task': [status: TaskStatus]
}>()

const dragOver = ref(false)
const hoverIndex = ref<number | null>(null)

function onDrop(event: DragEvent) {
  dragOver.value = false
  const taskId = event.dataTransfer?.getData('text/plain')
  if (!taskId) return
  const position = hoverIndex.value ?? props.tasks.length
  hoverIndex.value = null
  emit('drop-task', taskId, props.status, position)
}
</script>
