<template>
  <UBadge
    :color="color"
    variant="subtle"
    size="sm"
    :label="PRIORITY_LABELS[priority]"
  />
</template>

<script setup lang="ts">
import type { Priority } from '#shared/types'
import { PRIORITY_LABELS } from '#shared/utils/tasks'

const props = defineProps<{ priority: Priority }>()

const color = computed(() => {
  switch (props.priority) {
    case 4: return 'error'
    case 3: return 'warning'
    case 2: return 'info'
    default: return 'neutral'
  }
})
</script>
