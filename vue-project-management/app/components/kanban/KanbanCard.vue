<template>
  <article
    class="rounded-md border border-default bg-default p-3 shadow-xs"
    :class="draggable ? 'cursor-grab active:cursor-grabbing' : ''"
    :draggable="draggable"
    :data-task-id="task.id"
    @dragstart="onDragStart"
  >
    <div class="mb-2 flex items-start justify-between gap-2">
      <h4 class="text-sm font-medium leading-snug">
        {{ task.title }}
      </h4>
      <PriorityBadge :priority="task.priority" />
    </div>
    <p
      v-if="task.description"
      class="mb-2 line-clamp-2 text-xs text-muted"
    >
      {{ task.description }}
    </p>
    <div class="flex items-center justify-between">
      <div class="flex flex-wrap gap-1">
        <UBadge
          v-for="tag in task.tags.slice(0, 2)"
          :key="tag"
          :label="tag"
          color="neutral"
          variant="outline"
          size="sm"
        />
      </div>
      <UAvatarGroup
        size="2xs"
        :max="3"
      >
        <UAvatar
          v-for="id in task.assigneeIds"
          :key="id"
          :alt="memberById.get(id)?.name ?? id"
        />
      </UAvatarGroup>
    </div>
    <p
      v-if="task.dueDate"
      class="mt-2 flex items-center gap-1 text-xs"
      :class="overdue ? 'text-error' : 'text-muted'"
    >
      <UIcon
        name="i-lucide-calendar"
        class="size-3"
      />
      {{ format(new Date(task.dueDate), 'MMM d') }}
      <span v-if="overdue">· overdue</span>
    </p>
  </article>
</template>

<script setup lang="ts">
import { format } from 'date-fns'
import type { Task } from '#shared/types'
import { isOverdue } from '#shared/utils/tasks'

const props = defineProps<{ task: Task, draggable: boolean }>()
const { memberById } = storeToRefs(useProjectsStore())

const overdue = computed(() => isOverdue(props.task))

function onDragStart(event: DragEvent) {
  event.dataTransfer?.setData('text/plain', props.task.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
</script>
