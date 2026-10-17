<template>
  <div>
    <p
      v-if="tasks.length === 0"
      class="py-6 text-center text-sm text-muted"
    >
      {{ emptyText }}
    </p>
    <ul
      v-else
      class="divide-y divide-default"
    >
      <li
        v-for="task in tasks"
        :key="task.id"
        class="flex items-center justify-between gap-3 py-3"
      >
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">
            {{ task.title }}
          </p>
          <p class="flex items-center gap-2 text-xs text-muted">
            <span
              v-if="showProject && projectById.get(task.projectId)"
              class="inline-flex items-center gap-1"
            >
              <span
                class="size-2 rounded-full"
                :style="{ backgroundColor: projectById.get(task.projectId)?.color }"
              />
              {{ projectById.get(task.projectId)?.name }}
            </span>
            <span>{{ STATUS_LABELS[task.status] }}</span>
            <span
              v-if="task.dueDate"
              :class="isOverdue(task) ? 'text-error' : ''"
            >
              {{ formatDue(task.dueDate) }}
            </span>
          </p>
        </div>
        <PriorityBadge :priority="task.priority" />
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { formatDistanceToNowStrict } from 'date-fns'
import type { Task } from '#shared/types'
import { STATUS_LABELS, isOverdue } from '#shared/utils/tasks'

withDefaults(defineProps<{ tasks: Task[], showProject?: boolean, emptyText?: string }>(), {
  showProject: false,
  emptyText: 'Nothing here yet.'
})

const { projectById } = storeToRefs(useProjectsStore())

function formatDue(date: string) {
  const relative = formatDistanceToNowStrict(new Date(date), { addSuffix: true })
  return `due ${relative}`
}
</script>
